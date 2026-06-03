import {require} from "../../../../utils/fn-utils.ts";

export function addExternalOutboundAccessPolicy(
    manifest: any,
    config: { host: string; ip?: string, ports?: any },
) {
    manifest.spec.accessPolicy ??= {};
    manifest.spec.accessPolicy.outbound ??= {};
    manifest.spec.accessPolicy.outbound.external ??= [];

    require(Array.isArray(manifest.spec.accessPolicy.outbound.external), () => `spec.accessPolicy.outbound.external must be a list`);

    manifest.spec.accessPolicy.outbound.external.push(config);
}