import type {AppDeployDescriptor} from "./common-types.ts";
import * as core from "@actions/core";
import {requireNotNull} from "./fn-utils.ts";

export function trimQuotes(value: string): string {
    return value.replace(/^["']|["']$/g, '');
}

export function versionPathForApp(descriptor: AppDeployDescriptor): string {
    return `env/${descriptor.cluster}/${descriptor.namespace}/${descriptor.appname}/${descriptor.appname}-version`
}

export function yamlFileForApp(descriptor: AppDeployDescriptor): string {
    return `env/${descriptor.cluster}/${descriptor.namespace}/${descriptor.appname}.yaml`
}

export function getRequiredInput(name: string): string {
    const input = getInput(name);
    requireNotNull(input, () => `"${name}" is required, but was not set`);
    return input;
}
export function getInput(name: string): string | null {
    return process.env[name.toUpperCase()] || null;
}

export function fatal(message: string): never {
    core.setFailed(message);
    core.error(message);
    process.exit(1);
}

export function centerFactory(linewidth: number): (text: string) => string {
    return (text: string) => {
        const padding = linewidth - text.length;
        const paddingLeft = ' '.repeat(padding / 2);
        return paddingLeft + text;
    }
}