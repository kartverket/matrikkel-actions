import {require} from "../../../../utils/fn-utils.ts";
import {isObject} from "../../utils.ts";

export function addEnvironmentVariable(
    manifest: any,
    name: string,
    value: string,
) {
    manifest.spec ??= {};
    manifest.spec.env ??= [];

    require(Array.isArray(manifest.spec.env), () => `spec.env must be a list`);

    const existing = manifest.spec.env.find((entry: any) => isObject(entry) && entry.name === name);
    require(existing == null, () => `Conflicting env var generated from database: ${name}`);

    manifest.spec.env.push({ name, value });
}