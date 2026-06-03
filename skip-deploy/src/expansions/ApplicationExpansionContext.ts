import * as core from "@actions/core";
import {require, requireNotNullOrEmpty} from "../../../utils/fn-utils.ts";
import * as yaml from "yaml";
import {createExternalSecretDoc} from "./crd/ExternalSecret.ts";
import type {DatabaseRuleDependencies} from "./rules/databasesRule.ts";

export type ExpansionRule = {
    readonly name: string;
    apply(context: ApplicationExpansionContext): Promise<void> | void;
}

export type ExternalSecretData = {
    readonly secretKey: string;
    readonly remoteKey: string;
}

export type ApplicationExpansionDependencies = {}
    & DatabaseRuleDependencies;

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

    findDocument(kind: string): any | undefined {
        if (kind === 'Application') return this.appDoc;
        return this.otherDocs.find(it => it.kind === kind);
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

    addDoc(doc: any) {
        this.otherDocs.push(doc);
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