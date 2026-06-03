import {require} from "../../../../utils/fn-utils.ts";

export function addExternalOutboundAccessPolicy(
    document: any,
    config: { host: string; ip?: string, ports?: any },
) {
    document.spec.accessPolicy ??= {};
    document.spec.accessPolicy.outbound ??= {};
    document.spec.accessPolicy.outbound.external ??= [];

    require(Array.isArray(document.spec.accessPolicy.outbound.external), () => `spec.accessPolicy.outbound.external must be a list`);

    document.spec.accessPolicy.outbound.external.push(config);
}