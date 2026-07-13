import {require} from "../../../../utils/fn-utils.ts";
import stringify from 'json-stable-stringify';

type Config = { host: string; ip?: string, ports?: any };

export function addExternalOutboundAccessPolicy(
    manifest: any,
    config: Config,
) {
    manifest.spec.accessPolicy ??= {};
    manifest.spec.accessPolicy.outbound ??= {};
    manifest.spec.accessPolicy.outbound.external ??= [];

    require(Array.isArray(manifest.spec.accessPolicy.outbound.external), () => `spec.accessPolicy.outbound.external must be a list`);

    const existingKeys = manifest.spec.accessPolicy.outbound.external.map(configKey);
    if (!existingKeys.includes(configKey(config))) {
        manifest.spec.accessPolicy.outbound.external.push(config);
    }
}

function configKey(config: Config): string {
    return stringify(config) ?? '';
}