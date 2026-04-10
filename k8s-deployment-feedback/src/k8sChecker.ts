import * as core from "@actions/core";
import {type KubernetesAppIdentificator, KubernetesAppIdentificatorSerde} from "../../utils/common-types.ts";
import {
    type Deployment,
    type KList,
    Kubectl,
    type Metadata,
    type Pod,
    type ReplicaSet,
    type StatefulSet
} from "./k8s.ts";
import type {Shell} from "../../utils/shell.ts";

export type DeploymentStatus =
    | { app: KubernetesAppIdentificator; status: 'NOT_FOUND'; }
    | { app: KubernetesAppIdentificator; status: 'NOT_STARTED'; }
    | {
    app: KubernetesAppIdentificator;
    status: 'INITIALIZING';
    desiredPods: number;
    readyPods: number;
    pods: PodStatus[];
}
    | { app: KubernetesAppIdentificator; status: 'READY'; desiredPods: number; readyPods: number; pods: PodStatus[]; }
    | { app: KubernetesAppIdentificator; status: 'FAILED'; desiredPods: number; readyPods: number; pods: PodStatus[]; reason?: string; }

export type PodStatus =
    | { podId: string; version: string; status: 'INITIALIZING'; }
    | { podId: string; version: string; status: 'READY'; }
    | { podId: string; version: string; status: 'FAILED'; reason: string; };

type NamespaceState = {
    statefulSets?: KList<StatefulSet>;
    deployments: KList<Deployment>;
    replicasets: KList<ReplicaSet>;
    pods: KList<Pod>;
};

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
const withOwner: (kind: string, ownerUid: string) => Predicate<{
    metadata?: Metadata
}> = (kind: string, ownerUid: string) => (it) => {
    const owner = it.metadata
        ?.ownerReferences
        ?.find(owner => owner.uid === ownerUid && owner.kind === kind)
    return owner != null;
}

type AppChecker = (app: KubernetesAppIdentificator) => DeploymentStatus;
type AppCheckStrategy = (state: NamespaceState) => AppChecker;
const SkiperatorAppChecker: AppCheckStrategy = (state: NamespaceState) => (app: KubernetesAppIdentificator) => {
    const deployment = state.deployments.items.find(withName(app.appname));
    const deploymentRevision = deployment?.metadata?.annotations?.["deployment.kubernetes.io/revision"]
    if (!deployment || !deploymentRevision) {
        core.debug(`[k8s] app ${KubernetesAppIdentificatorSerde.serialize(app)} missing deployment or revision`);
        return {status: 'NOT_FOUND', app};
    }


    const appPredicate: (item: { metadata?: Metadata }) => Boolean = (it) => {
        const k8sName = it.metadata?.labels?.['app.kubernetes.io/name'];
        const k8sVersion = it.metadata?.labels?.['app.kubernetes.io/version'];
        return k8sName === app.appname && k8sVersion === app.version;
    }

    const replicaset = state.replicasets.items.find(
        and(
            withName(app.appname),
            withVersion(app.version),
            withRevision(deploymentRevision),
            withOwner('Deployment', deployment.metadata.uid),
        )
    );
    if (!replicaset) {
        core.debug(`[k8s] app ${KubernetesAppIdentificatorSerde.serialize(app)} missing replicaset for revision ${deploymentRevision}`);
        return {status: 'NOT_STARTED', app};
    }

    const readyPods = replicaset.status.readyReplicas ?? 0;
    const desiredPods = Number(replicaset.metadata?.annotations?.['deployment.kubernetes.io/desired-replicas'] ?? '-1');

    const podstatuses: PodStatus[] = state.pods.items
        .filter(appPredicate)
        .filter(
            and(
                withName(app.appname),
                withVersion(app.version),
                withOwner('ReplicaSet', replicaset.metadata.uid),
            )
        )
        .map(getPodstatus);

    return deduceDeploymentstatus(app, readyPods, desiredPods, podstatuses);
}

const StatefulSetChecker: AppCheckStrategy = (state: NamespaceState) => (app: KubernetesAppIdentificator) => {
    const statefulset = state.statefulSets?.items?.find(it => it.metadata.name === app.appname);
    if (!statefulset) {
        core.debug(`[k8s] app ${KubernetesAppIdentificatorSerde.serialize(app)} missing statefulset.`);
        return {status: 'NOT_FOUND', app};
    }

    const podstatuses = state.pods.items
        .filter(it => {
            const imageAndName = it.spec.containers.map(it => ({
                name: it.name,
                image: it.image,
            }));

            return imageAndName.some(it =>
                it.name == app.appname &&
                it.image.endsWith(`:${app.version}`)
            );
        })
        .map(getPodstatus);

    const readyPods = statefulset.status.readyReplicas ?? 0;
    const desiredPods = statefulset.spec.replicas;

    return deduceDeploymentstatus(app, readyPods, desiredPods, podstatuses);
}

function deduceDeploymentstatus(app: KubernetesAppIdentificator, readyPods: number, desiredPods: number, podstatuses: PodStatus[]): DeploymentStatus {
    const anyFailed = podstatuses.some(it => it.status === 'FAILED');
    const anyInitializing = podstatuses.some(it => it.status === 'INITIALIZING');

    core.info(`Found Pods: ${podstatuses.length}. Init: ${anyInitializing} Failed: ${anyFailed}`);

    let status: DeploymentStatus['status'];
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

    return {
        app,
        status,
        readyPods,
        desiredPods,
        pods: podstatuses
    };
}

export class K8sNamespaceChecker {
    private apps: Map<string, KubernetesAppIdentificator> = new Map();
    private k8s: Kubectl;
    private includeStatefulSets: boolean;

    constructor(
        shell: Shell,
        namespace: string,
        includeStatefulSets: boolean,
    ) {
        this.k8s = new Kubectl(shell, namespace);
        this.includeStatefulSets = includeStatefulSets;
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

        // Statefulsets are controlled by skiperator, hence we cannot filter based on label.
        // Thus, we need to fetch all data, and manually filter the relevant data.
        const labelSelector = this.includeStatefulSets ? undefined :`application.skiperator.no/app-name in (${appnames.join(',')})`;

        const output: DeploymentStatus[] = [];

        const [statefulSets, deployments, replicasets, pods] = await Promise.all([
            this.includeStatefulSets ? this.k8s.listStatefulSets(labelSelector) : Promise.resolve(undefined),
            this.k8s.listDeployments(labelSelector),
            this.k8s.listReplicasets(labelSelector),
            this.k8s.listPods(labelSelector),
        ]);

        const state: NamespaceState = {statefulSets, deployments, replicasets, pods};
        core.debug(`[k8s] selector="${labelSelector}" deployments=${state.deployments.items.length} replicasets=${state.replicasets.items.length} pods=${state.pods.items.length}`);

        const strategies: AppChecker[] = [SkiperatorAppChecker(state)];
        if (this.includeStatefulSets) {
            strategies.push(StatefulSetChecker(state))
        }

        for (const app of this.getApps()) {
            const results = strategies.map(it => it(app));
            const relevantResult: DeploymentStatus = results
                    .filter(it => it.status !== 'NOT_FOUND')
                    .at(0)
                ?? { status: 'FAILED', app, desiredPods: 0, readyPods: 0, pods: [], reason: 'Could not find application' };

            output.push(relevantResult);
        }

        return output;
    }
}

function getPodstatus(pod: Pod): PodStatus {
    const podId = pod.metadata.name;
    const version = pod.metadata.labels?.['app.kubernetes.io/version'] ?? '????';
    if (!pod.status) {
        return {status: 'INITIALIZING', podId, version}
    }

    if (pod.status.phase === 'Failed') {
        return {status: 'FAILED', reason: 'PodPhaseFailed', podId, version};
    }

    const containerStatuses = [
        ...(pod.status.containerStatuses ?? []),
        ...(pod.status.initContainerStatuses ?? []),
    ];
    for (const containerStatus of containerStatuses) {
        const state = containerStatus.state;
        const waitReason = state?.waiting?.reason ?? '';

        if (/BackOff|ErrImagePull|ImagePullBackOff|CreateContainerConfigError|RunContainerError|InvalidImageName/i.test(waitReason)) {
            return {status: 'FAILED', reason: waitReason, podId, version};
        }

        if (state?.terminated) {
            if (state.terminated.exitCode !== 0) {
                return {
                    status: 'FAILED',
                    reason: state.terminated.reason ?? `ExitCode(${state.terminated.exitCode})`,
                    podId,
                    version
                }
            }
        }
    }

    const conditions = pod.status.conditions ?? [];
    const readyCondition = conditions.find(it => it.type === 'Ready');

    if (readyCondition?.status === 'True') {
        return {status: 'READY', podId, version}
    }

    if (containerStatuses.length > 0 && containerStatuses.every(it => it.ready)) {
        return {status: 'READY', podId, version}
    }

    return {status: 'INITIALIZING', podId, version}
}

export class K8sChecker {
    private shell: Shell;
    private intervalMs: number;
    private timeoutMs: number;
    private includeStatefulSets: boolean;
    private appsToCheck: Record<string, K8sNamespaceChecker> = {};

    constructor(
        shell: Shell,
        intervalMs: number,
        timeoutMs: number,
        includeStatefulSets: boolean
    ) {
        this.shell = shell;
        this.intervalMs = intervalMs;
        this.timeoutMs = timeoutMs;
        this.includeStatefulSets = includeStatefulSets;
    }

    public addApps(appDeployments: KubernetesAppIdentificator[]) {
        for (const app of appDeployments) {
            this.addApp(app);
        }
    }

    public addApp(appDeployment: KubernetesAppIdentificator) {
        const namespaceGroup = this.appsToCheck[appDeployment.namespace] ?? new K8sNamespaceChecker(this.shell, appDeployment.namespace, this.includeStatefulSets);
        namespaceGroup.addApp(appDeployment);
        this.appsToCheck[appDeployment.namespace] = namespaceGroup;
    }

    public async checkDeployments(): Promise<DeploymentStatus[]> {
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
    return (value: TIn) => {
        for (const predicate of predicates) {
            if (!predicate(value)) return false;
        }
        return true;
    }
}
