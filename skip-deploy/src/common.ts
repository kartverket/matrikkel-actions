import {require, requireNotNullOrEmpty} from "../../utils/fn-utils.ts";
import type {KubernetesAppIdentificator} from "../../utils/common-types.ts";
import * as yaml from "yaml";
import { getInput, getRequiredInput } from "../../utils/utils.ts";

export async function readAppInputs() {
    const cluster = getRequiredInput('cluster');
    const resource = getRequiredInput('resource');
    const varMatrixStr = getInput('var');

    const workspace = process.env['GITHUB_WORKSPACE'];
    const resources = resource.split(',')
        .map(it => it.trim())
        .filter(Boolean)
        .map(it => workspace ? `${workspace}/${it}` : it);

    require(resources.length > 0, () => `Must provide at least one resource file`)
    for (const resource of resources) {
        const file = Bun.file(resource)
        const exists = await file.exists()
        require(exists, () => `"${resource}" was not found`);
    }

    const varMatrix: Array<Record<string, string>> = varMatrixStr
        ? varMatrixStr
            .split(/[\r\n]+/)
            .map(it => it.trim())
            .filter(Boolean)
            .map(line => {
                const vars = line.split(',')
                    .map(it => it.trim())
                    .map(it => it.split('=').map(i => i.trim()))
                return Object.fromEntries(vars)
            })
        : [{}];

    return {
        cluster,
        resources,
        varMatrix
    }
}

export function interpolateResource(input: { resource: string, vars: Record<string, string>}): string {
    return input.resource.replace(
        /{{\s*([^{}]+?)\s*}}/g,
        (_, key: string) => {
            if (!(key in input.vars)) {
                throw new Error(`Missing template variable: ${key}`);
            }
            return input.vars[key]!;
        }
    );
}

export function findAppDescriptor(yamlfile: string): KubernetesAppIdentificator {
    const content = yaml.parse(yamlfile);
    const namespace = content.metadata.namespace;
    const appname = content.metadata.name;
    const version = content.metadata.version;

    requireNotNullOrEmpty(namespace, () => 'Could not find namespace in yaml');
    requireNotNullOrEmpty(appname, () => 'Could not find appname in yaml');
    requireNotNullOrEmpty(version, () => 'Could not find version in yaml');

    return { namespace, appname, version }
}