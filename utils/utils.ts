import type {AppDeployDescriptor} from "./common-types.ts";

export function trimQuotes(value: string): string {
    return value.replace(/^["']|["']$/g, '');
}

export function versionPathForApp(descriptor: AppDeployDescriptor): string {
    return `env/${descriptor.cluster}/${descriptor.namespace}/${descriptor.appname}/${descriptor.appname}-version`
}

export function yamlFileForApp(descriptor: AppDeployDescriptor): string {
    return `env/${descriptor.cluster}/${descriptor.namespace}/${descriptor.appname}.yaml`
}