import * as core from "@actions/core";
import {require, requireNotNullOrEmpty, Serde} from "./fn-utils.ts";

export function fatal(message: string): never {
    core.error(message);
    process.exit(1);
}

export function versionPathForApp(descriptor: AppDeployDescriptor): string {
    return `env/${descriptor.cluster}/${descriptor.namespace}/${descriptor.appname}/${descriptor.appname}-version`
}

export function trimQuotes(value: string): string {
    return value.replace(/^["']|["']$/g, '');
}

type ImageDescriptor = {
    readonly name: string;
    readonly version: string;
}

export const ImageDescriptorSerde : Serde<ImageDescriptor> = new Serde(
    (descriptor) => {
        return `"${descriptor.name}:${descriptor.version}"`
    },
    (descriptor: string) => {
        const fragments = trimQuotes(descriptor.trim()).split(':');
        const name = fragments.slice(0, -1).join(':');
        const version = fragments[fragments.length - 1];

        requireNotNullOrEmpty(name);
        requireNotNullOrEmpty(version);

        return { name, version };
    }
);

export type AppDeployDescriptor = {
    readonly cluster: string;
    readonly namespace: string;
    readonly appname: string;
    readonly version: string;
}

export const AppDeployDescriptorSerde : Serde<AppDeployDescriptor> = new Serde(
    (descriptor) => `${descriptor.cluster}:${descriptor.namespace}:${descriptor.appname}:${descriptor.version}`,
    (descriptor) => {
        const fragments = descriptor.split(':').map(it => it.trim());
        require(fragments.length === 4, () => `Invalid descriptor: ${descriptor}`);

        const [cluster, namespace, appname, version] = fragments;
        requireNotNullOrEmpty(cluster);
        requireNotNullOrEmpty(namespace);
        requireNotNullOrEmpty(appname);
        requireNotNullOrEmpty(version);

        return { cluster, namespace, appname, version };
    }
);