import {require, requireNotNullOrEmpty, Serde} from "./fn-utils.ts";
import { trimQuotes } from './utils.ts';

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

export type AppDescriptor = { cluster: string; namespace: string; appname: string; };
export const AppDescriptorSerde : Serde<AppDescriptor> = new Serde(
    (descriptor) => `${descriptor.cluster}:${descriptor.namespace}:${descriptor.appname}`,
    (descriptor) => {
        const fragments = descriptor.split(':').map(it => it.trim());
        require(fragments.length === 3, () => `Invalid descriptor: ${descriptor}`);

        const [cluster, namespace, appname] = fragments;
        requireNotNullOrEmpty(cluster);
        requireNotNullOrEmpty(namespace);
        requireNotNullOrEmpty(appname);

        return { cluster, namespace, appname };
    }
);

export type AppDeployDescriptor = AppDescriptor & {
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