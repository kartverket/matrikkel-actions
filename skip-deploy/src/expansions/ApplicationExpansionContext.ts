import * as core from "@actions/core";
import {require, requireNotNullOrEmpty} from "../../../utils/fn-utils.ts";
import {isObject} from "../utils.ts";
import * as yaml from "yaml";
import {createExternalSecretDoc} from "./crd/ExternalSecret.ts";

export type ExpansionRule = {
    readonly name: string;
    apply(context: ApplicationExpansionContext): Promise<void> | void;
}
export type ExternalPort = {
    readonly name: string;
    readonly port: number;
    readonly protocol: string;
}

export type ExternalRule = {
    readonly host: string;
    readonly ip?: string;
    readonly ports?: ExternalPort[];
}

export type ExternalSecretData = {
    readonly secretKey: string;
    readonly remoteKey: string;
}

type DatabaseMetadata = {
    readonly name: string;
    readonly url: string;
    readonly host: string;
    readonly ip: string;
    readonly ports: ExternalPort[];
}

export type DatabaseMetadataResolver = (namespace: string, databaseName: string) => Promise<DatabaseMetadata>;

export type ApplicationExpansionDependencies = {
    databases: DatabaseMetadataResolver;
}

export class ApplicationExpansionContext {
    readonly generatedExternalSecretData: ExternalSecretData[] = [];
    public readonly namespace: string;
    public readonly appname: string;

    constructor(
        public readonly appDoc: any,
        public readonly otherDocs: any[],
        public readonly dependencies: ApplicationExpansionDependencies,
    ) {
        const namespace = appDoc.metadata?.namespace;
        const appname = appDoc.metadata?.name;

        requireNotNullOrEmpty(namespace, () => 'Could not find namespace in yaml');
        requireNotNullOrEmpty(appname, () => 'Could not find appname in yaml');

        this.namespace = namespace;
        this.appname = appname;
    }

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

    addSensitiveValue(value: string | undefined) {
        if (value != null && value.length > 0) {
            core.setSecret(value);
        }
    }

    addEnvValue(name: string, value: string) {
        const env = this.appDoc.spec.env ?? [];
        require(Array.isArray(env), () => `spec.env must be a list`);

        const existing = env.find((entry: any) => isObject(entry) && entry.name === name);
        require(existing == null, () => `Conflicting env var generated from database: ${name}`);

        env.push({ name, value });
        this.appDoc.spec.env = env;
    }

    serialize(): string {
        const output = [this.appDoc, ...this.otherDocs];

        if (this.generatedExternalSecretData.length > 0) {
            const { name, manifest } = createExternalSecretDoc(this.namespace, this.appname, this.generatedExternalSecretData);
            output.push(manifest);
            this.appDoc.spec.envFrom ??= [];
            this.appDoc.spec.envFrom.push({ secret: name });
        }
        return stringifyDocs(output);
    }
}

function stringifyDocs(docs: unknown[]): string {
    return docs.map(doc => yaml.stringify(doc).trimEnd()).join('\n---\n') + '\n';
}