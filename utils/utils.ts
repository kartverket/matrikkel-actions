import type {AppDeployDescriptor} from "./common-types.ts";
import * as core from "@actions/core";

export function trimQuotes(value: string): string {
    return value.replace(/^["']|["']$/g, '');
}

export function versionPathForApp(descriptor: AppDeployDescriptor): string {
    return `env/${descriptor.cluster}/${descriptor.namespace}/${descriptor.appname}/${descriptor.appname}-version`
}

export function yamlFileForApp(descriptor: AppDeployDescriptor): string {
    return `env/${descriptor.cluster}/${descriptor.namespace}/${descriptor.appname}.yaml`
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