import * as core from "@actions/core";
import {require, requireNotNullOrEmpty} from "../../../utils/fn-utils.ts";
import * as yaml from "yaml";
import type {DatabaseRuleDependencies} from "./expansion-rules/databasesRule.ts";

export type ExpansionRule = {
    readonly name: string;
    apply(context: ApplicationExpansionContext): Promise<void> | void;
}
export type PostProcessingRule = {
    readonly name: string;
    apply(context: ApplicationExpansionContext): Promise<void> | void;
};

export type ApplicationExpansionDependencies = {}
    & DatabaseRuleDependencies;

/**
 * The kinds of manifests that are treated as the "main" workload manifest
 * that expansion rules operate on, as opposed to side-car resources such as
 * ExternalSecret, VirtualService, NetworkPolicy, etc.
 */
export type MainManifestKind = 'Application' | 'SKIPJob';

export function isMainManifestKind(kind: unknown): kind is MainManifestKind {
    return kind === 'Application' || kind === 'SKIPJob';
}

function assertValidMainManifestKind(kind: unknown): asserts kind is MainManifestKind {
    require(isMainManifestKind(kind), () => `Expected manifest kind to be "Application" or "SKIPJob", but was "${kind}"`);
}

export class ApplicationExpansionContext {
    public readonly namespace: string;
    public readonly appname: string;
    public readonly kind: MainManifestKind;

    constructor(
        public readonly cluster: string,
        public readonly appManifest: any,
        public readonly otherManifests: any[],
        public readonly dependencies: ApplicationExpansionDependencies,
    ) {
        const namespace = appManifest.metadata?.namespace;
        const appname = appManifest.metadata?.name;

        requireNotNullOrEmpty(namespace, () => 'Could not find namespace in yaml');
        requireNotNullOrEmpty(appname, () => 'Could not find appname in yaml');
        assertValidMainManifestKind(appManifest.kind);

        this.namespace = namespace;
        this.appname = appname;
        this.kind = appManifest.kind;
    }

    /** Whether the main manifest is a `SKIPJob`, as opposed to an `Application`. */
    get isJob(): boolean {
        return this.kind === 'SKIPJob';
    }

    findManifestOfKind(kind: string): any | undefined {
        if (kind === this.appManifest.kind) return this.appManifest;
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

