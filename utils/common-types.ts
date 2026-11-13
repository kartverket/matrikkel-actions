import {require, requireNotNull, requireNotNullOrEmpty, Serde} from "./fn-utils.ts";
import { trimQuotes } from './utils.ts';

type ImageDescriptor = {
    readonly name: string;
    readonly version: string;
    readonly sha?: string;
}

/**
 * Serde for docker image
 * Format: <...name>:<version>
 */
export const ImageDescriptorSerde : Serde<ImageDescriptor> = new Serde(
    (descriptor) => {
        const sha = descriptor.sha ? `@sha256:${descriptor.sha}` : '';
        return `"${descriptor.name}:${descriptor.version}${sha}"`;
    },
    (descriptor: string) => {
        const fragments = trimQuotes(descriptor.trim()).split(/[:@]/);

        const hasSha = fragments.some(it => it === 'sha256');
        const versionIndex = hasSha ? -3 : -1;

        const name = fragments.slice(0, versionIndex).join(':');

        const version = fragments[fragments.length + versionIndex];

        requireNotNullOrEmpty(name);
        requireNotNullOrEmpty(version);

        if (hasSha) {
            const sha = hasSha ? fragments[fragments.length -1] : undefined;
            requireNotNullOrEmpty(sha);

            return { name, version, sha };
        } else {
            return { name, version };
        }
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
        require(fragments.length === 3, () => `Invalid KubernetesAppIdentificator: ${descriptor}`);

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
        require(fragments.length === 4, () => `Invalid AppDeployDescriptor: ${descriptor}`);

        const [cluster, namespace, appname, version] = fragments;
        requireNotNullOrEmpty(cluster, () => `Field "cluster" cannot be null or empty`);
        requireNotNullOrEmpty(namespace, () => `Field "namespace" cannot be null or empty`);
        requireNotNullOrEmpty(appname, () => `Field "appname" cannot be null or empty`);
        requireNotNullOrEmpty(version, () => `Field "version" cannot be null or empty`);

        return { cluster, namespace, appname, version };
    }
);

export function extractImageDescriptorFromYaml(
    app: AppDeployDescriptor,
    yaml: string
): ImageDescriptor {
    const imageMatch = yaml.match(/image:\s?("?ghcr.io\/.+:.+"?)/)
    requireNotNull(imageMatch, () => `Could not find image-reference in yaml for ${AppDeployDescriptorSerde.serialize(app)}`)

    const [, imageDescriptorStr] = imageMatch;
    requireNotNull(imageDescriptorStr);

    return ImageDescriptorSerde.deserialize(imageDescriptorStr);
}

export type RepoDescriptor = {
    owner: string;
    name: string;
};
export const RepoDescriptorSerde : Serde<RepoDescriptor> = new Serde(
    (descriptor) => `${descriptor.owner}/${descriptor.name}`,
    (descriptor) => {
        const fragments = descriptor.split('/');
        require(fragments.length === 2, () => `Invalid repo descriptor: ${descriptor}`);

        const [owner, name] = fragments;
        requireNotNullOrEmpty(owner, () => `Field "owner" cannot be null or empty`);
        requireNotNullOrEmpty(name, () => `Field "name" cannot be null or empty`);

        return { owner, name };
    },
);