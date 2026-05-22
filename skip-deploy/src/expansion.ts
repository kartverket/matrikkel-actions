import {$} from "bun";
import * as core from "@actions/core";
import * as yaml from "yaml";
import {require, requireNotNullOrEmpty} from "../../utils/fn-utils.ts";
import {getRequiredInput} from "../../utils/utils.ts";

type ExternalPort = {
    readonly name: string;
    readonly port: number;
    readonly protocol: string;
}

type ExternalRule = {
    readonly host: string;
    readonly ip?: string;
    readonly ports?: ExternalPort[];
}

type DatabaseMetadata = {
    readonly host: string;
    readonly ip: string;
    readonly ports: ExternalPort[];
}

type ExternalSecretData = {
    readonly secretKey: string;
    readonly remoteKey: string;
}

export type ExpandedManifest = {
    readonly manifest: string;
    readonly sensitiveValues: string[];
}

export type DatabaseMetadataResolver = (gsmMetadataSecret: string) => Promise<DatabaseMetadata>;

type ExpansionDependencies = {
    readonly resolveDatabaseMetadata: DatabaseMetadataResolver;
}

type ExpansionRule = {
    readonly name: string;
    apply(context: ApplicationExpansionContext): Promise<void> | void;
}

class ApplicationExpansionContext {
    readonly generatedExternalSecretData: ExternalSecretData[] = [];
    readonly generatedOutboundRules: ExternalRule[] = [];
    readonly sensitiveValues: string[] = [];

    constructor(
        readonly appDoc: any,
        readonly namespace: string,
        readonly appname: string,
        private readonly dependencies: ExpansionDependencies
    ) {}

    addExternalSecretData(data: ExternalSecretData) {
        const existing = this.generatedExternalSecretData.find(it => it.secretKey === data.secretKey);
        if (existing == null) {
            this.generatedExternalSecretData.push(data);
            return;
        }

        require(
            existing.remoteKey === data.remoteKey,
            () => `Conflicting generated secret key: ${data.secretKey}`
        );
    }

    addOutboundRule(rule: ExternalRule) {
        this.generatedOutboundRules.push(rule);
    }

    addSensitiveValue(value: string | undefined) {
        if (value != null && value.length > 0) {
            this.sensitiveValues.push(value);
        }
    }

    resolveDatabaseMetadata(gsmMetadataSecret: string): Promise<DatabaseMetadata> {
        return this.dependencies.resolveDatabaseMetadata(gsmMetadataSecret);
    }
}

export async function expandKubernetesManifests(
    manifest: string,
    resolveDatabaseMetadata: DatabaseMetadataResolver = resolveDatabaseMetadataFromGsm
): Promise<ExpandedManifest[]> {
    const docs = yaml.parseAllDocuments(manifest)
        .map(doc => doc.toJSON())
        .filter(Boolean);

    const applicationDocs = docs.filter(isApplication);
    require(applicationDocs.length > 0, () => `Could not find Application manifest`);

    const expanded: ExpandedManifest[] = [];
    for (const app of applicationDocs) {
        const appDoc = structuredClone(app);
        const context = createExpansionContext(appDoc, { resolveDatabaseMetadata });

        for (const rule of expansionRules) {
            await rule.apply(context);
        }
        mergeOutboundRules(appDoc, context.generatedOutboundRules);

        const outputDocs: unknown[] = [appDoc];
        if (context.generatedExternalSecretData.length > 0) {
            ensureGeneratedSecretEnvFrom(appDoc, context.appname);
            outputDocs.push(createExternalSecretDoc(context.namespace, context.appname, context.generatedExternalSecretData));
        }

        expanded.push({
            manifest: stringifyDocuments(outputDocs),
            sensitiveValues: context.sensitiveValues,
        });
    }

    return expanded;
}

export function redactSensitiveValues(input: string, sensitiveValues: string[]): string {
    return sensitiveValues.reduce(
        (acc, value) => value ? acc.replaceAll(value, '***') : acc,
        input
    );
}

const envGsmSecretRule: ExpansionRule = {
    name: 'env-gsm-secret',
    apply: (context) => {
        const env = context.appDoc.spec?.env;
        if (env == null) return;
        require(Array.isArray(env), () => `spec.env must be a list`);

        const remainingEnv: unknown[] = [];
        for (const entry of env) {
            if (!isObject(entry) || entry.gsmSecretName == null) {
                remainingEnv.push(entry);
                continue;
            }

            requireNotNullOrEmpty(entry.name, () => `spec.env[].name is required when gsmSecretName is used`);
            requireNotNullOrEmpty(entry.gsmSecretName, () => `spec.env[].gsmSecretName is required`);
            context.addExternalSecretData({ secretKey: entry.name, remoteKey: entry.gsmSecretName });
        }

        if (remainingEnv.length > 0) {
            context.appDoc.spec.env = remainingEnv;
        } else {
            delete context.appDoc.spec.env;
        }
    },
};

const databaseOutboundRule: ExpansionRule = {
    name: 'database-outbound',
    apply: async (context) => {
        const databases = context.appDoc.spec?.databases;
        if (databases == null) return;
        require(Array.isArray(databases), () => `spec.databases must be a list`);

        for (const database of databases) {
            require(isObject(database), () => `spec.databases[] must be an object`);
            require(database.host == null && database.ip == null, () => `spec.databases[] must not contain host or ip; use gsmMetadataSecret`);
            requireNotNullOrEmpty(database.gsmMetadataSecret, () => `spec.databases[].gsmMetadataSecret is required`);

            const metadata = await context.resolveDatabaseMetadata(database.gsmMetadataSecret);
            context.addSensitiveValue(metadata.host);
            context.addSensitiveValue(metadata.ip);
            context.addOutboundRule(metadata);
        }

        delete context.appDoc.spec.databases;
    },
};

const outboundShortcutRule: ExpansionRule = {
    name: 'outbound-shortcut',
    apply: (context) => {
        const outbound = context.appDoc.spec?.outbound;
        if (outbound == null) return;
        require(Array.isArray(outbound), () => `spec.outbound must be a list`);

        for (const rule of outbound) {
            validateExternalRule(rule, 'spec.outbound[]');
            context.addOutboundRule(rule);
        }

        delete context.appDoc.spec.outbound;
    },
};

const expansionRules: ExpansionRule[] = [
    envGsmSecretRule,
    databaseOutboundRule,
    outboundShortcutRule,
];

async function resolveDatabaseMetadataFromGsm(gsmMetadataSecret: string): Promise<DatabaseMetadata> {
    const project = getRequiredInput('kubernetes_project_id');
    const raw = await $`gcloud secrets versions access latest --secret=${gsmMetadataSecret} --project=${project}`.text();
    const metadata = JSON.parse(raw);
    validateDatabaseMetadata(metadata, gsmMetadataSecret);
    core.setSecret(metadata.host);
    core.setSecret(metadata.ip);
    return metadata;
}

function createExpansionContext(appDoc: any, dependencies: ExpansionDependencies): ApplicationExpansionContext {
    const namespace = appDoc.metadata?.namespace;
    const appname = appDoc.metadata?.name;

    requireNotNullOrEmpty(namespace, () => 'Could not find namespace in yaml');
    requireNotNullOrEmpty(appname, () => 'Could not find appname in yaml');

    return new ApplicationExpansionContext(appDoc, namespace, appname, dependencies);
}

function stringifyDocuments(docs: unknown[]): string {
    return docs.map(doc => yaml.stringify(doc).trimEnd()).join('\n---\n') + '\n';
}

function ensureGeneratedSecretEnvFrom(appDoc: any, appname: string) {
    const secretName = `${appname}-secrets`;
    const envFrom = appDoc.spec.envFrom ?? [];
    require(Array.isArray(envFrom), () => `spec.envFrom must be a list`);

    const existing = envFrom.find((entry: any) => isObject(entry) && entry.secret === secretName);
    if (!existing) {
        envFrom.push({ secret: secretName });
    }
    appDoc.spec.envFrom = envFrom;
}

function mergeOutboundRules(appDoc: any, rules: ExternalRule[]) {
    if (rules.length === 0) return;

    appDoc.spec.accessPolicy ??= {};
    appDoc.spec.accessPolicy.outbound ??= {};
    const external = appDoc.spec.accessPolicy.outbound.external ?? [];
    require(Array.isArray(external), () => `spec.accessPolicy.outbound.external must be a list`);

    for (const rule of rules) {
        const existing = external.find((it: ExternalRule) => outboundRuleIdentity(it) === outboundRuleIdentity(rule));
        if (existing == null) {
            external.push(rule);
            continue;
        }
        require(
            stableStringify(existing) === stableStringify(rule),
            () => `Conflicting outbound rule for ${outboundRuleIdentity(rule)}`
        );
    }

    appDoc.spec.accessPolicy.outbound.external = external;
}

function createExternalSecretDoc(namespace: string, appname: string, data: ExternalSecretData[]) {
    return {
        apiVersion: 'external-secrets.io/v1',
        kind: 'ExternalSecret',
        metadata: {
            name: `${appname}-externalsecrets`,
            namespace,
        },
        spec: {
            refreshInterval: '1h',
            secretStoreRef: {
                kind: 'SecretStore',
                name: 'gsm',
            },
            target: {
                name: `${appname}-secrets`,
            },
            data: data.map(entry => ({
                secretKey: entry.secretKey,
                remoteRef: {
                    key: entry.remoteKey,
                    metadataPolicy: 'None',
                },
            })),
        },
    };
}

function validateDatabaseMetadata(metadata: any, source: string): asserts metadata is DatabaseMetadata {
    require(isObject(metadata), () => `Database metadata secret ${source} must contain a JSON object`);
    requireNotNullOrEmpty(metadata.host, () => `Database metadata secret ${source} must contain host`);
    requireNotNullOrEmpty(metadata.ip, () => `Database metadata secret ${source} must contain ip`);
    require(Array.isArray(metadata.ports) && metadata.ports.length > 0, () => `Database metadata secret ${source} must contain non-empty ports`);
    for (const port of metadata.ports) {
        validateExternalPort(port, `Database metadata secret ${source} ports[]`);
    }
}

function validateExternalRule(rule: any, context: string): asserts rule is ExternalRule {
    require(isObject(rule), () => `${context} must be an object`);
    requireNotNullOrEmpty(rule.host, () => `${context}.host is required`);
    if (rule.ports != null) {
        require(Array.isArray(rule.ports), () => `${context}.ports must be a list`);
        for (const port of rule.ports) {
            validateExternalPort(port, `${context}.ports[]`);
        }
    }
}

function validateExternalPort(port: any, context: string): asserts port is ExternalPort {
    require(isObject(port), () => `${context} must be an object`);
    requireNotNullOrEmpty(port.name, () => `${context}.name is required`);
    require(typeof port.port === 'number', () => `${context}.port must be a number`);
    requireNotNullOrEmpty(port.protocol, () => `${context}.protocol is required`);
}

function isApplication(doc: any): boolean {
    return isObject(doc) && doc.kind === 'Application';
}

function isObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value != null && !Array.isArray(value);
}

function outboundRuleIdentity(rule: ExternalRule): string {
    return `${rule.host}:${rule.ip ?? ''}`;
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (isObject(value)) {
        return `{${Object.keys(value)
            .sort()
            .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}
