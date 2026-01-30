import {$} from "bun";

export type KList<TResource> = {
    kind: "List",
    items: TResource[];
}

export type Metadata = {
    name: string;
    namespace: string;
    annotations: Record<string, string>;
    labels: Record<string, string>;
    ownerReferences?: { kind: string; name: string }[];
};

export type Pod = {
    kind: 'Pod';
    metadata: Metadata;
    status?: {
        phase?: string;
        conditions?: { type: string; status: string }[];
        containerStatuses?: {
            name: string;
            ready: boolean;
            restartCount: number;
            state?: {
                waiting?: { reason?: string; message?: string };
                running?: { startedAt?: string };
                terminated?: { reason?: string; exitCode?: number; message?: string };
            };
        }[];
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
    async listPods(selector?: string | Record<string, string>): Promise<KList<Pod>> {
        const strSelector = Kubectl.buildSelector(selector);
        if (strSelector) {
            return Kubectl.asJson(['-n', this.namespace, 'get', 'pods', '-l', strSelector]);
        } else {
            return Kubectl.asJson(['-n', this.namespace, 'get', 'pods']);
        }
    }

    async listDeployments(selector?: string | Record<string, string>): Promise<KList<Deployment>> {
        const strSelector = Kubectl.buildSelector(selector);
        if (strSelector) {
            return Kubectl.asJson(['-n', this.namespace, 'get', 'deployment', '-l', strSelector])
        } else {
            return Kubectl.asJson(['-n', this.namespace, 'get', 'deployment'])
        }
    }

    async listReplicasets(selector?: string | Record<string, string>): Promise<KList<ReplicaSet>> {
        const strSelector = Kubectl.buildSelector(selector);
        if (strSelector) {
            return Kubectl.asJson(['-n', this.namespace, 'get', 'rs', '-l', strSelector])
        } else {
            return Kubectl.asJson(['-n', this.namespace, 'get', 'rs'])
        }
    }

    async getDeployment(deploymentName: string): Promise<Deployment> {
        return Kubectl.asJson(['-n', this.namespace, 'get', 'deployment', deploymentName]);
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
        const res = await $`kubectl ${allArgs}`.quiet();
        if (res.exitCode !== 0) {
            throw new Error(res.stderr.toString().trim() || "kubectl failed");
        }
        const text = res.stdout.toString();
        return JSON.parse(text);
    }
}
