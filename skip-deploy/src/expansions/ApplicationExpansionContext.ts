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
        public readonly appManifest: any,
        public readonly otherManifests: any[],
        public readonly dependencies: ApplicationExpansionDependencies,
    ) {
        const namespace = appManifest.metadata?.namespace;
        const appname = appManifest.metadata?.name;

        requireNotNullOrEmpty(namespace, () => 'Could not find namespace in yaml');
        requireNotNullOrEmpty(appname, () => 'Could not find appname in yaml');

        this.namespace = namespace;
        this.appname = appname;
    }

    findManifestOfKind(kind: string): any | undefined {
        if (kind === 'Application') return this.appManifest;
        return this.otherManifests.find(it => it.kind === kind);
    }

    addSensitiveValue(value: string | undefined) {
        if (value != null && value.length > 0) {
            core.setSecret(value);
        }
    }

    addManifest(manifest: any) {
        this.otherManifests.push(manifest);
    }

    serialize(): string {
        return [this.appManifest, ...this.otherManifests]
            .map(it => yaml.stringify(it).trimEnd())
            .join('\n---\n') + '\n';
    }
}

