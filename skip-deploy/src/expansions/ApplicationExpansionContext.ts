import * as core from "@actions/core";
import {requireNotNullOrEmpty} from "../../../utils/fn-utils.ts";
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

/**
 * skiperator's `v1alpha1` SKIPJob nests the "application-like" fields
 * (image, env, envFrom, accessPolicy, etc.) under `spec.container`, see
 * `ContainerSettings` in skiperator's api/v1alpha1/skipjob_types.go.
 * `Application` (and `v1beta1` SKIPJob) has these fields directly under
 * `spec` instead, see api/v1beta1/skipjob_types.go.
 */
const SKIPJOB_V1ALPHA1_CONTAINER_FIELDS = [
    'image', 'priority', 'command', 'resources', 'env', 'envFrom', 'filesFrom',
    'additionalPorts', 'extraContainers', 'liveness', 'readiness', 'startup',
    'accessPolicy', 'gcp', 'restartPolicy', 'podSettings',
    // Custom extension fields consumed by skip-deploy's own expansion rules;
    // not part of the skiperator CRD itself.
    'databases', 'azure',
] as const;

function isSkipJobV1Alpha1(manifest: any): boolean {
    return manifest.kind === 'SKIPJob'
        && typeof manifest.apiVersion === 'string'
        && manifest.apiVersion.includes('v1alpha1');
}

/**
 * Hoists `spec.container.*` fields up to `spec` in-place, so that the
 * existing expansion rules (written against `Application`'s flat `spec`)
 * work unmodified for a `v1alpha1` SKIPJob too.
 */
function hoistContainerFields(manifest: any): void {
    const container = manifest.spec?.container;
    if (container == null) return;
    delete manifest.spec.container;
    Object.assign(manifest.spec, container);
}

/**
 * Reverses {@link hoistContainerFields} without mutating the input, by
 * moving the known container fields back under a `spec.container` object.
 * Used right before serializing a `v1alpha1` SKIPJob back to YAML.
 */
function withLoweredContainerFields(manifest: any): any {
    const spec = { ...manifest.spec };
    const container: Record<string, any> = {};
    for (const field of SKIPJOB_V1ALPHA1_CONTAINER_FIELDS) {
        if (field in spec) {
            container[field] = spec[field];
            delete spec[field];
        }
    }
    spec.container = container;
    return { ...manifest, spec };
}

export class ApplicationExpansionContext {
    public readonly namespace: string;
    public readonly appname: string;
    public readonly kind: MainManifestKind | undefined;

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

        this.namespace = namespace;
        this.appname = appname;
        this.kind = isMainManifestKind(appManifest.kind) ? appManifest.kind : undefined;

        if (isSkipJobV1Alpha1(appManifest)) {
            hoistContainerFields(appManifest);
        }
    }

    /**
     * Whether the main manifest is a `SKIPJob`. Jobs do not support inbound
     * access policy or ports, unlike `Application`
     * (see https://skip.kartverket.no/docs/jobber-skip).
     */
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
        const appManifest = isSkipJobV1Alpha1(this.appManifest)
            ? withLoweredContainerFields(this.appManifest)
            : this.appManifest;
        return [appManifest, ...this.otherManifests]
            .map(it => yaml.stringify(it).trimEnd())
            .join('\n---\n') + '\n';
    }
}

