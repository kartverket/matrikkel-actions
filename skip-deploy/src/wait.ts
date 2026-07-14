import {findAppDescriptor, interpolateResource, readAppInputs} from "./common.ts";
import { expandKubernetesManifests} from "./expansions/expansion.ts";
import {type KubernetesAppIdentificator, KubernetesAppIdentificatorSerde} from "../../utils/common-types.ts";
import {createShell} from "@nutgaard/bun-recording-shell";
import {type DeploymentStatus, K8sChecker} from "../../utils/k8s/k8sChecker.ts";
import {Duration} from "../../utils/Duration.ts";
import {centerFactory, fatal, getRequiredInput} from "../../utils/utils.ts";
import * as core from "@actions/core";
import {groupBy} from "../../utils/fn-utils.ts";
import {createAppsRepoDatabaseMetadataResolver} from "./expansions/expansion-rules/databasesRule.ts";

const workspace = process.env['GITHUB_WORKSPACE'];
if (workspace) {
    // Ensure file operations target the checked-out repo
    process.chdir(`${workspace}/apps-repo`);
}

const timeout = getRequiredInput('timeout');
const { cluster, resources, varMatrix  } = await readAppInputs();
const resolveDatabaseMetadata = createAppsRepoDatabaseMetadataResolver(cluster);

const descriptorsToWaitFor: KubernetesAppIdentificator[] = [];
for (const resource of resources) {
    const file = Bun.file(resource);
    const content = await file.text();
    for (const vars of varMatrix) {
        const output = interpolateResource({resource: content, vars});
        const expandedManifests = await expandKubernetesManifests(cluster, output, {
            databases: resolveDatabaseMetadata
        });
        descriptorsToWaitFor.push(...expandedManifests.map(it => findAppDescriptor(it.manifest)));
    }
}

const shellRecordingPath = process.env.SHELL_RECORDING_PATH;
const shell = createShell({ mode: 'record', recordingLogPath: shellRecordingPath });
const timeoutMs = Duration.parse(timeout).toWholeMilliseconds();
const checkIntervalMs = Duration.ofSeconds(10).toWholeMilliseconds();
const k8sChecker = new K8sChecker(shell, checkIntervalMs, timeoutMs, true);

k8sChecker.addApps(descriptorsToWaitFor);

const errors = k8sChecker.validate()
if (errors.length > 0) {
    fatal(errors.join('\n'));
}

const lineWidth = 40;
const separator = '-'.repeat(lineWidth);
const centerText = centerFactory(lineWidth);
const start = Date.now();

while (true) {
    const now = Date.now();
    if (now - start > timeoutMs) {
        fatal(`Timeout after ${timeoutMs}ms... Check deployment...`)
    }

    core.info('Checking deployments');
    const deploymentStatus = await k8sChecker.checkDeployments();
    const byStatus = groupBy(deploymentStatus, it => it.status);

    const notStarted = byStatus['NOT_STARTED'] ?? [];
    const initializing = byStatus['INITIALIZING'] ?? [];
    const failed = byStatus['FAILED'] ?? [];
    const ready = byStatus['READY'] ?? [];

    const lines: string[] = [
        ...groupStatus('Ikke started enda', notStarted, true),
        '',
        ...groupStatus('Pågående deployments', initializing, true),
        '',
        ...groupStatus('Klare deployments', ready, false),
        '',
        ...groupStatus('Feilede deployments', failed, true),
        '',
    ];
    core.info(lines.join('\n'));
    core.info('\n'.repeat(3));

    const nonCompletedStates = [notStarted, initializing];
    const allStatusesResolved = nonCompletedStates.every(it => it.length === 0);
    if (allStatusesResolved) {
        if (failed.length > 0) {
            fatal(
                groupStatus('Feilede deployments', failed).join('\n')
            );
        }
        if (ready.length !== descriptorsToWaitFor.length) {
            fatal(`Antall klare deployments matchers ikke forventet antall. Forventet ${descriptorsToWaitFor.length}, men fant ${ready.length}`);
        } else {
            core.info('Alle deployments er klare');
            process.exit(0);
        }
    }

    await Bun.sleep(checkIntervalMs);
}

function groupStatus(heading: string, deploymentStatuses: DeploymentStatus[], ignoreIfEmpty: boolean = false): string[] {
    if (ignoreIfEmpty && deploymentStatuses.length === 0) return [];
    const output = [
        separator,
        centerText(heading),
        separator
    ];

    if (deploymentStatuses.length === 0) {
        output.push('Ingen')
    } else {
        for (const status of deploymentStatuses) {
            output.push(`${KubernetesAppIdentificatorSerde.serialize(status.app)}`)
        }
    }

    return output;
}
