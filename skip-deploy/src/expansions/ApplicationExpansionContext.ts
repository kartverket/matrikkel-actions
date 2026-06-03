import * as core from "@actions/core";
import {requireNotNullOrEmpty} from "../../../utils/fn-utils.ts";
import * as yaml from "yaml";
import type {DatabaseRuleDependencies} from "./rules/databasesRule.ts";

export type ExpansionRule = {
    readonly name: string;
    apply(context: ApplicationExpansionContext): Promise<void> | void;
}

export type ApplicationExpansionDependencies = {}
    & DatabaseRuleDependencies;

export class ApplicationExpansionContext {
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

    addSensitiveValue(value: string | undefined) {
        if (value != null && value.length > 0) {
            core.setSecret(value);
        }
    }

    addDoc(doc: any) {
        this.otherDocs.push(doc);
    }

    serialize(): string {
        return stringifyDocs([this.appDoc, ...this.otherDocs]);
    }
}

function stringifyDocs(docs: unknown[]): string {
    return docs.map(doc => yaml.stringify(doc).trimEnd()).join('\n---\n') + '\n';
}