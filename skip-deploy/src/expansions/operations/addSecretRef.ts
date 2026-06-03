import {require} from "../../../../utils/fn-utils.ts";
import {isObject} from "../../utils.ts";

export function addSecretRef(manifest: any, secretKey: string, remoteRef: string) {
    manifest.spec ??= {};
    manifest.spec.data ??= [];

    require(Array.isArray(manifest.spec.data), () => `spec.data must be a list`);

    const existing = manifest.spec.data.find((entry: any) => isObject(entry) && entry.secretKey === secretKey);
    require(existing == null, () => `Conflicting secretKey: ${secretKey}`);

    manifest.spec.data.push({
        secretKey,
        remoteRef: {
            key: remoteRef,
            metadataPolicy: 'None'
        }
    });
}