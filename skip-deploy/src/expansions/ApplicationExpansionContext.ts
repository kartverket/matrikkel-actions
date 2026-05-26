import * as core from "@actions/core";
import {require} from "../../../utils/fn-utils.ts";
import {isObject} from "../utils.ts";

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
    readonly generatedOutboundRules: ExternalRule[] = [];

    constructor(
        public readonly appDoc: any,
        public readonly namespace: string,
        public readonly appname: string,
        public readonly dependencies: ApplicationExpansionDependencies,
    ) {
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

    addOutboundRule(rule: ExternalRule) {
        this.generatedOutboundRules.push(rule);
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

        env.push({name, value});
        this.appDoc.spec.env = env;
    }
}
