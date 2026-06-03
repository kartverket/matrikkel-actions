import {require} from "../../../../utils/fn-utils.ts";
import {isObject} from "../../utils.ts";

export function addEnvironmentVariable(
    document: any,
    name: string,
    value: string,
) {
    document.spec ??= {};
    document.spec.env ??= [];

    require(Array.isArray(document.spec.env), () => `spec.env must be a list`);

    const existing = document.spec.env.find((entry: any) => isObject(entry) && entry.name === name);
    require(existing == null, () => `Conflicting env var generated from database: ${name}`);

    document.spec.env.push({ name, value });
}