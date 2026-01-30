import type {KubernetesAppIdentificator} from "../../utils/common-types.ts";
import {Kubectl, type Metadata, type Pod} from "./k8s.ts";

export type DeploymentStatus =
    | { app: KubernetesAppIdentificator; status: 'NOT_STARTED'; }
    | { app: KubernetesAppIdentificator; status: 'INITIALIZING'; desiredPods: number; readyPods: number; pods: PodStatus[]; }
    | { app: KubernetesAppIdentificator; status: 'READY'; desiredPods: number; readyPods: number; pods: PodStatus[]; }
    | { app: KubernetesAppIdentificator; status: 'FAILED'; desiredPods: number; readyPods: number; pods: PodStatus[]; }

export type PodStatus =
    | { podId: string; version: string; status: 'INITIALIZING'; }
    | { podId: string; version: string; status: 'READY'; }
    | { podId: string; version: string; status: 'FAILED'; reason: string; };

export class K8sNamespaceChecker {
    private apps: Set<KubernetesAppIdentificator> = new Set();
    private k8s: Kubectl;

    constructor(namespace: string) {
        this.k8s = new Kubectl(namespace);
    }

    public getApps(): KubernetesAppIdentificator[] {
        return Array.from(this.apps)
    }

    public addApp(app: KubernetesAppIdentificator) {
        this.apps.add(app);
    }

    public async checkDeployments(): Promise<DeploymentStatus[]> {
        const applist = Array.from(this.apps);
        const appnames = applist.map(it => it.appname);

        const labelSelector = `application.skiperator.no/app-name in (${appnames.join(',')})`;

        const allReplicasets = await this.k8s.listReplicasets(labelSelector);
        const allPods = await this.k8s.listPods(labelSelector);

        const output: DeploymentStatus[] = [];

        for (const app of this.apps) {
            const appPredicate: (item: { metadata: Metadata }) => Boolean = (it) => {
                const k8sName = it.metadata.labels['app.kubernetes.io/name'];
                const k8sVersion = it.metadata.labels['app.kubernetes.io/version'];
                return k8sName === app.appname && k8sVersion === app.version;
            }

            const replicaset = allReplicasets.items.find(appPredicate);

            if (!replicaset) {
                output.push({status: 'NOT_STARTED', app });
            } else {
                const readyPods = replicaset.status.readyReplicas ?? 0;
                const desiredPods = Number(replicaset.metadata.annotations['deployment.kubernetes.io/desired-replicas'] ?? '-1');
                const podstatuses = allPods.items.filter(appPredicate).map(K8sNamespaceChecker.getPodstatus)
                const anyFailed = podstatuses.some(it => it.status === 'FAILED');
                const anyInitializing = podstatuses.some(it => it.status === 'INITIALIZING');

                let status: DeploymentStatus['status'] = 'NOT_STARTED';
                if (anyFailed) {
                    status = 'FAILED'
                } else if (anyInitializing) {
                    status = 'INITIALIZING'
                } else if (readyPods !== desiredPods) {
                    status = 'INITIALIZING'
                } else {
                    status = 'READY'
                }

                const deploymentstatus: DeploymentStatus = {
                    app,
                    status,
                    readyPods,
                    desiredPods,
                    pods: podstatuses
                }
                output.push(deploymentstatus);
            }
        }

        return output;
    }

    private static getPodstatus(pod: Pod): PodStatus {
        const podId = pod.metadata.name;
        const version = pod.metadata.labels['app.kubernetes.io/version'] ?? '????';
        if (!pod.status) {
            return { status: 'INITIALIZING', podId, version }
        }

        if (pod.status.phase === 'Failed') {
            return { status: 'FAILED', reason: 'PodPhaseFailed', podId, version };
        }

        const containerStatuses = pod.status.containerStatuses ?? [];
        for (const containerStatus of containerStatuses) {
            const state = containerStatus.state;
            const waitReason = state?.waiting?.reason ?? '';

            if (/BackOff|ErrImagePull|ImagePullBackOff|CreateContainerConfigError|RunContainerError|InvalidImageName/i.test(waitReason)) {
                return { status: 'FAILED', reason: waitReason, podId, version };
            }

            if (state?.terminated) {
                if (state.terminated.exitCode !== 0) {
                    return { status: 'FAILED', reason: state.terminated.reason ?? `ExitCode(${state.terminated.exitCode})`, podId, version}
                }
            }
        }

        const conditions = pod.status.conditions ?? [];
        const readyCondition = conditions.find(it => it.type === 'Ready');

        if (readyCondition?.status === 'True') {
            return { status: 'READY', podId, version }
        }

        if (containerStatuses.length > 0 && containerStatuses.every(it => it.ready)) {
            return { status: 'READY', podId, version }
        }

        return { status: 'INITIALIZING', podId, version }
    }
}

export class K8sChecker {
    private intervalMs: number;
    private timeoutMs: number;
    private appsToCheck: Record<string, K8sNamespaceChecker> = {};

    constructor(intervalMs: number, timeoutMs: number) {
        this.intervalMs = intervalMs;
        this.timeoutMs = timeoutMs;
    }

    public addApps(appDeployments: KubernetesAppIdentificator[]) {
        for (const app of appDeployments) {
            this.addApp(app);
        }
    }

    public addApp(appDeployment: KubernetesAppIdentificator) {
        const namespaceGroup = this.appsToCheck[appDeployment.namespace] ?? new K8sNamespaceChecker(appDeployment.namespace);
        namespaceGroup.addApp(appDeployment);
        this.appsToCheck[appDeployment.namespace] = namespaceGroup;
    }

    public async checkDeployments() : Promise<DeploymentStatus[]> {
        const checks: Array<DeploymentStatus[]> = await Promise.all(
            Object.values(this.appsToCheck).map(it => it.checkDeployments())
        );
        return checks.flat();
    }

    public validate(): string[] {
        const errors: string[] = [];

        if (!Number.isFinite(this.intervalMs) || this.intervalMs <= 0) {
            errors.push("intervalMs must be a positive number")
        }
        if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
            errors.push("timeoutMs must be a positive number")
        }

        return errors;
    }
}