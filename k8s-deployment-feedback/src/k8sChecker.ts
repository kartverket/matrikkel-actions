import * as core from "@actions/core";
import {type KubernetesAppIdentificator, KubernetesAppIdentificatorSerde} from "../../utils/common-types.ts";
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
    private apps: Map<string, KubernetesAppIdentificator> = new Map();
    private k8s: Kubectl;

    constructor(namespace: string) {
        this.k8s = new Kubectl(namespace);
    }

    public getApps(): KubernetesAppIdentificator[] {
        return Array.from(this.apps.values())
    }

    public addApp(app: KubernetesAppIdentificator) {
        this.apps.set(KubernetesAppIdentificatorSerde.serialize(app), app);
    }

    public async checkDeployments(): Promise<DeploymentStatus[]> {
        const applist = this.getApps();
        const appnames = applist.map(it => it.appname);

        const labelSelector = `application.skiperator.no/app-name in (${appnames.join(',')})`;

        const allDeployment = await this.k8s.listDeployments(labelSelector);
        const allReplicasets = await this.k8s.listReplicasets(labelSelector);
        const allPods = await this.k8s.listPods(labelSelector);

        core.debug(`[k8s] selector="${labelSelector}" deployments=${allDeployment.items.length} replicasets=${allReplicasets.items.length} pods=${allPods.items.length}`);

        const output: DeploymentStatus[] = [];

        const withName: (name: string) => Predicate<{ metadata?: Metadata }> = (name: string) => (it) => {
            const k8sName = it.metadata?.labels?.['app.kubernetes.io/name'];
            return name === k8sName;
        }
        const withVersion: (version: string) => Predicate<{ metadata?: Metadata }> = (name: string) => (it) => {
            const k8sVersion = it.metadata?.labels?.['app.kubernetes.io/version'];
            return name === k8sVersion;
        }
        const withRevision: (revison: string) => Predicate<{ metadata?: Metadata }> = (name: string) => (it) => {
            const k8sVersion = it.metadata?.annotations?.['deployment.kubernetes.io/revision'];
            return name === k8sVersion;
        }
        const withOwner: (kind: string, ownerUid: string) => Predicate<{ metadata?: Metadata }> = (kind: string, ownerUid: string) => (it) => {
            const owner = it.metadata?.ownerReferences
                ?.find(owner => owner.uid === ownerUid && owner.kind === kind)
            return owner != null;
        }

        for (const app of this.getApps()) {
            const deployment = allDeployment.items.find(withName(app.appname));
            const deploymentRevision = deployment?.metadata?.annotations?.["deployment.kubernetes.io/revision"]
            if (!deployment || !deploymentRevision) {
                core.debug(`[k8s] app ${KubernetesAppIdentificatorSerde.serialize(app)} missing deployment or revision`);
                output.push({ status: 'NOT_STARTED', app });
                continue;
            }


            const appPredicate: (item: { metadata?: Metadata }) => Boolean = (it) => {
                const k8sName = it.metadata?.labels?.['app.kubernetes.io/name'];
                const k8sVersion = it.metadata?.labels?.['app.kubernetes.io/version'];
                return k8sName === app.appname && k8sVersion === app.version;
            }

            const replicaset = allReplicasets.items.find(
                and(
                    withName(app.appname),
                    withVersion(app.version),
                    withRevision(deploymentRevision),
                    withOwner('Deployment', deployment.metadata.uid),
                )
            );
            if (!replicaset) {
                core.debug(`[k8s] app ${KubernetesAppIdentificatorSerde.serialize(app)} missing replicaset for revision ${deploymentRevision}`);
                output.push({status: 'NOT_STARTED', app });
                continue;
            }

            const readyPods = replicaset.status.readyReplicas ?? 0;
            const desiredPods = Number(replicaset.metadata?.annotations?.['deployment.kubernetes.io/desired-replicas'] ?? '-1');
            const podstatuses = allPods.items
                .filter(appPredicate)
                .filter(
                    and(
                        withName(app.appname),
                        withVersion(app.version),
                        withOwner('ReplicaSet', replicaset.metadata.uid),
                    )
                )
                .map(K8sNamespaceChecker.getPodstatus)
            core.debug(`[k8s] app ${KubernetesAppIdentificatorSerde.serialize(app)} rs=${replicaset.metadata.name} rev=${deploymentRevision} readyPods=${readyPods} desiredPods=${desiredPods} pods=${podstatuses.length}`);
            const anyFailed = podstatuses.some(it => it.status === 'FAILED');
            const anyInitializing = podstatuses.some(it => it.status === 'INITIALIZING');

            core.info(`Got RS status: ${JSON.stringify(replicaset.status)} Desired: ${desiredPods}`);
            core.info(`Found Pods: ${podstatuses.length}. Init: ${anyInitializing} Failed: ${anyFailed}`);

            let status: DeploymentStatus['status'] = 'NOT_STARTED';
            if (anyFailed) {
                const failed = podstatuses.filter(it => it.status === 'FAILED')
                    .map(it => `${it.podId}:${it.reason}`)
                    .join(', ');
                core.debug(`[k8s] app ${KubernetesAppIdentificatorSerde.serialize(app)} failed pods: ${failed}`);
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

        return output;
    }

    private static getPodstatus(pod: Pod): PodStatus {
        const podId = pod.metadata.name;
        const version = pod.metadata.labels?.['app.kubernetes.io/version'] ?? '????';
        if (!pod.status) {
            return { status: 'INITIALIZING', podId, version }
        }

        if (pod.status.phase === 'Failed') {
            return { status: 'FAILED', reason: 'PodPhaseFailed', podId, version };
        }

        const containerStatuses = [
            ...(pod.status.containerStatuses ?? []),
            ...(pod.status.initContainerStatuses ?? []),
        ];
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

type Predicate<TIn> = (value: TIn) => Boolean;
function and<TIn>(...predicates: Array<Predicate<TIn>>): Predicate<TIn> {
    return (value: TIn)=> {
        for (const predicate of predicates) {
            if (!predicate(value)) return false;
        }
        return true;
    }
}
