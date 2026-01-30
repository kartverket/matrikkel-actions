import * as core from '@actions/core';
import {centerFactory, fatal} from "./utils.ts";
import {type KubernetesAppIdentificator, KubernetesAppIdentificatorSerde} from "../../utils/common-types.ts";
import {type DeploymentStatus, K8sChecker} from "./k8sChecker.ts";
import {groupBy} from "../../utils/fn-utils.ts";

const SECOND = 1000;
const MINUTE = 60 * 1000;
const TEN_MINUTES = 10 * MINUTE;
const TEN_SECONDS = 10 * SECOND;


const appsString = core.getMultilineInput('apps', { required: true, trimWhitespace: true })
const apps: KubernetesAppIdentificator[] = appsString
    .map(it => KubernetesAppIdentificatorSerde.deserialize(it));

const timeoutStr = core.getInput('timeoutMs', {required: false});
const checkIntervalStr = core.getInput('intervalMs', {required: false});
const timeoutMs = timeoutStr === '' ? TEN_MINUTES : Number(timeoutStr);
const checkIntervalMs = checkIntervalStr === '' ? TEN_SECONDS : Number(checkIntervalStr);

const k8sChecker = new K8sChecker(checkIntervalMs, timeoutMs);
k8sChecker.addApps(apps);
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
        ...groupStatus('Feilede deployments', failed, false),
        '',
    ];
    core.info(lines.join('\n'));


    const allStatusesResolved = notStarted.length === 0 && initializing.length === 0;
    if (allStatusesResolved) {
        if (failed.length > 0) {
            fatal(
                groupStatus('Feilede deployments', failed).join('\n')
            );
        }
        if (ready.length !== apps.length) {
            fatal(`Antall klare deployments matchers ikke forventet antall. Forventet ${apps.length}, men fant ${ready.length}`);
        } else {
            core.info('Alle deployments er klare');
            break;
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
        output.push('\tIngen')
    } else {
        for (const status of deploymentStatuses) {
            output.push(`\t${KubernetesAppIdentificatorSerde.serialize(status.app)}`)
        }
    }

    return output;
}