import * as core from "@actions/core";
import {$} from "bun";

export type KList<TResource> = {
    kind: "List",
    items: TResource[];
}

export type Metadata = {
    uid: string;
    name: string;
    namespace: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
    ownerReferences?: Array<{
        kind: string;
        name: string;
        uid: string;
    }>;
};
export type ContainerStatus = {
    name: string;
    ready: boolean;
    restartCount: number;
    state?: {
        waiting?: { reason?: string; message?: string };
        running?: { startedAt?: string };
        terminated?: { reason?: string; exitCode?: number; message?: string };
    };
};
export type Pod = {
    kind: 'Pod';
    metadata: Metadata;
    spec: {
        containers: Array<{
            name: string;
            image: string;
        }>;
    };
    status?: {
        phase?: string;
        conditions?: { type: string; status: string }[];
        containerStatuses?: Array<ContainerStatus>;
        initContainerStatuses?: Array<ContainerStatus>;
    };
};
export type StatefulSet = {
    kind: "StatefulSet",
    metadata: Metadata;
    spec: {
        replicas: number;
        selector: {
            matchLabels: Record<string, string>
        }
    };
    status: {
        replicas: number;
        updatedReplicas: number;
        readyReplicas: number;
    };
};
export type Deployment = {
    kind: "Deployment",
    metadata: Metadata;
    spec: {
        replicas: number;
        selector: {
            matchLabels: Record<string, string>
        }
    };
    status: {
        replicas: number;
        updatedReplicas: number;
        readyReplicas: number;
        unavailableReplicas: number;
    };
};

export type ReplicaSet = {
    kind: "ReplicaSet";
    metadata: Metadata;
    spec: {
        replicas: number;
        selector: {
            matchLabels: Record<string, string>
        }
    };
    status: {
        replicas: number;
        updatedReplicas: number;
        readyReplicas: number;
        unavailableReplicas: number;
    };
};

export class Kubectl {
    constructor(private namespace: string) {
    }
    async listStatefulSets(selector?: string | Record<string, string>): Promise<KList<StatefulSet>> {
        return this.listResource('statefulset', selector);
    }

    async listDeployments(selector?: string | Record<string, string>): Promise<KList<Deployment>> {
        return this.listResource('deployment', selector);
    }

    async listReplicasets(selector?: string | Record<string, string>): Promise<KList<ReplicaSet>> {
        return this.listResource('replicaset', selector);
    }

    async listPods(selector?: string | Record<string, string>): Promise<KList<Pod>> {
        return this.listResource('pod', selector);
    }

    async listResource<T>(resource: string, selector?: string | Record<string, string>): Promise<KList<T>> {
        const strSelector = Kubectl.buildSelector(selector);
        if (strSelector) {
            return Kubectl.asJson(['-n', this.namespace, 'get', resource, '-l', strSelector]);
        } else {
            return Kubectl.asJson(['-n', this.namespace, 'get', resource]);
        }
    }

    private static buildSelector(selector?: string | Record<string, string>): string | undefined {
        if (!selector) return undefined;
        else if (typeof selector === 'string') return selector
        else return Object.entries(selector)
                .map(([k, v]) => `${k}=${v}`)
                .join(',')
    }

    static async asJson(args: string[]) {
        const allArgs = [...args, '-o', 'json']
        core.debug(`kubectl ${allArgs.join(' ')}`);
        const res = await $`kubectl ${allArgs}`.quiet();
        if (res.exitCode !== 0) {
            core.debug(`kubectl stderr: ${res.stderr.toString().trim()}`);
            throw new Error(res.stderr.toString().trim() || "kubectl failed");
        }
        const text = res.stdout.toString();
        return JSON.parse(text);
    }
}
