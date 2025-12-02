import type {AppDescriptor} from "./common-types.ts";

export function trimQuotes(value: string): string {
    return value.replace(/^["']|["']$/g, '');
}

export function versionPathForApp(descriptor: AppDescriptor): string {
    return `env/${descriptor.cluster}/${descriptor.namespace}/${descriptor.appname}/${descriptor.appname}-version`
}