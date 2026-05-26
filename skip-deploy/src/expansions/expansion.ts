import * as yaml from "yaml";
import {require, requireNotNullOrEmpty} from "../../../utils/fn-utils.ts";
import {
    ApplicationExpansionContext,
    type ApplicationExpansionDependencies,
    type ExpansionRule, type ExternalRule,
    type ExternalSecretData
} from "./ApplicationExpansionContext.ts";
import {envGsmSecretRule} from "./rules/envGsmSecretRule.ts";
import {isObject} from "../utils.ts";
import {databasesRule} from "./rules/databasesRule.ts";

export type ExpandedManifest = {
    readonly manifest: string;
}

const rules: ExpansionRule[] = [
    envGsmSecretRule,
    databasesRule,
];

export async function expandKubernetesManifests(
    manifest: string,
    dependencies: ApplicationExpansionDependencies,
): Promise<ExpandedManifest[]> {
    const docs = yaml.parseAllDocuments(manifest)
        .map(doc => doc.toJSON())
        .filter(Boolean);

    const applicationDocs = docs.filter(function (doc: any): boolean {
        return isObject(doc) && doc.kind === 'Application';
    });
    require(applicationDocs.length > 0, () => `Could not find Application manifest`);

    const expanded: ExpandedManifest[] = [];
    for (const app of applicationDocs) {
        const appDoc = structuredClone(app);
        const namespace = appDoc.metadata?.namespace;
        const appname = appDoc.metadata?.name;

        requireNotNullOrEmpty(namespace, () => 'Could not find namespace in yaml');
        requireNotNullOrEmpty(appname, () => 'Could not find appname in yaml');

        const context = new ApplicationExpansionContext(appDoc, namespace, appname, dependencies);

        for (const rule of rules) {
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
        });
    }

    return expanded;
}

function mergeOutboundRules(appDoc: any, rules: ExternalRule[]) {
    if (rules.length === 0) return;

    appDoc.spec.accessPolicy ??= {};
    appDoc.spec.accessPolicy.outbound ??= {};
    const external = appDoc.spec.accessPolicy.outbound.external ?? [];
    require(Array.isArray(external), () => `spec.accessPolicy.outbound.external must be a list`);

    const identity = (it: ExternalRule) => `${it.host}:${it.ip}:${it.ports}`;

    for (const rule of rules) {
        const existing = external.find((it: ExternalRule) => identity(it) === identity(rule));
        if (existing == null) {
            external.push(rule);
        }
    }

    appDoc.spec.accessPolicy.outbound.external = external;
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
        envFrom.push({secret: secretName});
    }
    appDoc.spec.envFrom = envFrom;
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