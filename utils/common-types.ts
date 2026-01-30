import {require, requireNotNullOrEmpty, Serde} from "./fn-utils.ts";
import { trimQuotes } from './utils.ts';

type ImageDescriptor = {
    readonly name: string;
    readonly version: string;
}

/**
 * Serde for docker image
 * Format: <...name>:<version>
 */
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

export type KubernetesAppIdentificator = {
    readonly namespace: string;
    readonly appname: string;
    readonly version: string;
};
/**
 * Serde for identifying kubernetes app
 * Format: <namespace>:<appname>:<version>
 */
export const KubernetesAppIdentificatorSerde : Serde<KubernetesAppIdentificator> = new Serde(
    (descriptor) => `${descriptor.namespace}:${descriptor.appname}:${descriptor.version}`,
    (descriptor) => {
        const fragments = descriptor.split(':').map(it => it.trim());
        require(fragments.length === 3, () => `Invalid descriptor: ${descriptor}`);

        const [namespace, appname, version] = fragments;
        requireNotNullOrEmpty(namespace, () => `Field "namespace" cannot be null or empty`);
        requireNotNullOrEmpty(appname, () => `Field "appname" cannot be null or empty`);
        requireNotNullOrEmpty(version, () => `Field "version" cannot be null or empty`);

        return { namespace, appname, version };
    }
);

export type AppDeployDescriptor = {
    readonly cluster: string;
    readonly namespace: string;
    readonly appname: string;
    readonly version: string;
}

/**
 * Serde for application deployment descriptor
 * Format: <cluster>:<namespace>:<appname>:<version>
 */
export const AppDeployDescriptorSerde : Serde<AppDeployDescriptor> = new Serde(
    (descriptor) => `${descriptor.cluster}:${descriptor.namespace}:${descriptor.appname}:${descriptor.version}`,
    (descriptor) => {
        const fragments = descriptor.split(':').map(it => it.trim());
        require(fragments.length === 4, () => `Invalid descriptor: ${descriptor}`);

        const [cluster, namespace, appname, version] = fragments;
        requireNotNullOrEmpty(cluster, () => `Field "cluster" cannot be null or empty`);
        requireNotNullOrEmpty(namespace, () => `Field "namespace" cannot be null or empty`);
        requireNotNullOrEmpty(appname, () => `Field "appname" cannot be null or empty`);
        requireNotNullOrEmpty(version, () => `Field "version" cannot be null or empty`);

        return { cluster, namespace, appname, version };
    }
);