import type {WebClient} from "@slack/web-api";
import type {AnyBlock, ContextBlockElement} from "@slack/types/dist/block-kit/blocks";
import type {GitHub} from "@actions/github/lib/utils";
import * as core from "@actions/core";
import * as github from "@actions/github";
import {
    type AppDeployDescriptor,
    extractImageDescriptorFromYaml,
    ImageDescriptorSerde
} from "../../utils/common-types.ts";
import {versionPathForApp, yamlFileForApp} from "../../utils/utils.ts";

export type ApprovalStatus = 'AWAITING' | 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED';
export type ApprovalState = {
    status: ApprovalStatus;
    version: string;
    environment: string;
    commits: Array<{ gitsha: string; message: string; }>;
    approver?: string;
    approvedAt?: Date;
}

export type LaF = { icon: string; color: string; text: string; }
export const LaFLUT: Record<ApprovalStatus, LaF> = {
    AWAITING: {icon: ':hourglass_flowing_sand:', color: '#B0BEC5', text: 'Venter på godkjenning'},
    RUNNING: {icon: ':rocket:', color: '#42A5F5', text: 'Prodsettes'},
    SUCCESS: {icon: ':white_check_mark:', color: '#2E7D32', text: 'Suksess'},
    FAILURE: {icon: ':x:', color: '#D32F2F', text: 'Feilet'},
    CANCELLED: {icon: ':stop_sign:', color: '#F6C344', text: 'Avbrutt'},
}

export async function postMessage(client: WebClient, channel: string, state: ApprovalState) {
    const response = await client.chat.postMessage(buildMessage(channel, state));

    return {ts: response.ts, channel: response.channel};
}

export async function updateMessage(client: WebClient, channel: string, ts: string, state: ApprovalState) {
    const response = await client.chat.update({
        ts,
        ...buildMessage(channel, state)
    });

    return {ts: response.ts, channel: response.channel};
}

const TXT_LIMIT = 3000;
const TXT_OVERFLOW = '...\nOg mye mer...';
const TXT_CUTOFF = TXT_LIMIT - TXT_OVERFLOW.length;

/**
 * Builds a single string representation of all commits.
 * The length is limited in slacks-api to 3000, hence we stop before this and insert an "overflow-message".
 */
function buildCommitString(state: ApprovalState): string {
    let length = 0;
    const strBuilder: string[] = [];
    for (const commit of state.commits) {
        const line = stringLimit(`\`${commit.gitsha}\` ${commit.message}`, 100)
        if (length + line.length + 1 >= TXT_CUTOFF) {
            strBuilder.push(TXT_OVERFLOW)
            break;
        }

        strBuilder.push(line);
        length += line.length + 1; // +1 to account for lineshifts
    }
    return strBuilder.join('\n');
}

function stringLimit(value: string, limit: number): string {
    if (value.length <= limit) return value;
    return value.substring(0, limit - 3) + '...';
}

function buildMessage(channel: string, state: ApprovalState) {
    const commits: string = buildCommitString(state);

    const laf = LaFLUT[state.status];

    const commitBlock: AnyBlock | null = commits.length > 0 ? {
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": commits
        }
    } : null;
    const approverElement: ContextBlockElement = state.approver ? {
        "type": "mrkdwn",
        "text": `*Godkjent av:* <https://github.com/${state.approver}|${state.approver}>`
    } : {
        "type": "mrkdwn",
        "text": `<https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}|Gå til godkjenning?>`
    };
    const approvedAtElement: ContextBlockElement | null = state.approvedAt ? {
        "type": "mrkdwn",
        "text": `*Prodsatt:* Kl ${new Date().toLocaleTimeString('nb-no')}`
    } : null;

    return {
        channel,
        "attachments": [
            {
                "color": laf.color,
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": `${laf.icon} Prodsetting av ${github.context.repo.repo}:${state.version} til ${state.environment}`
                        }
                    },
                    commitBlock,
                    {
                        "type": "context",
                        "elements": [
                            {
                                "type": "mrkdwn",
                                "text": `*Status:* ${laf.text}`
                            },
                            {
                                "type": "mrkdwn",
                                "text": `*Id:* <https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}|${github.context.runId}>`
                            },
                            approverElement,
                            approvedAtElement,
                        ].filter(it => it != null)
                    }
                ].filter(it => it != null)
            }
        ]
    }
}

export type OctoUser = { user: { login: string; html_url: string; } };

export async function getApprovers(octokit: InstanceType<typeof GitHub>): Promise<OctoUser[]> {
    const approverResponse = await octokit.request(
        "GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals",
        {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            run_id: github.context.runId,
            headers: {
                "X-GitHub-Api-Version": "2022-11-28",
            },
        }
    );

    core.debug(`Got approval response: ${JSON.stringify(approverResponse)}`);
    return approverResponse.data as unknown as OctoUser[];
}

export async function getCurrentVersionFromAppsRepo(
    octokit: InstanceType<typeof GitHub>,
    descriptor: AppDeployDescriptor,
): Promise<string | null> {
    const versionFile = await getCurrentVersionFromVersionFile(octokit, descriptor);
    if (versionFile != null) return versionFile;

    return getCurrentVersionFromYamlFile(octokit, descriptor);
}

async function getCurrentVersionFromVersionFile(
    octokit: InstanceType<typeof GitHub>,
    descriptor: AppDeployDescriptor,
): Promise<string | null> {
    try {
        const content = await fetchHeimdallAppsFile(octokit, versionPathForApp(descriptor))
        const imageDescriptor = ImageDescriptorSerde.deserialize(content);
        core.debug(`Read image descriptor from apps repo: ${JSON.stringify(imageDescriptor)}`);
        return imageDescriptor.version;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        core.warning(`Could not read current version from apps repo: ${message}`);
        return null;
    }
}

async function getCurrentVersionFromYamlFile(
    octokit: InstanceType<typeof GitHub>,
    descriptor: AppDeployDescriptor,
) {
    try {
        const content = await fetchHeimdallAppsFile(octokit, yamlFileForApp(descriptor))
        const imageDescriptor = extractImageDescriptorFromYaml(descriptor, content);
        core.debug(`Read image descriptor from apps repo (YAML): ${JSON.stringify(imageDescriptor)}`);
        return imageDescriptor.version;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        core.warning(`Could not read current version from apps repo (YAML): ${message}`);
        return null;
    }
}

async function fetchHeimdallAppsFile(
    octokit: InstanceType<typeof GitHub>,
    path: string,
): Promise<string> {
    const response = await octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
            owner: 'kartverket',
            repo: 'heimdall-apps',
            path: path,
            ref: 'main',
            headers: {
                "Accept": "application/vnd.github.raw",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        }
    );
    return (response.data as unknown as string)?.toString().trim();
}

export async function getCommitsBetweenVersions(
    octokit: InstanceType<typeof GitHub>,
    base: string,
    head: string
): Promise<ApprovalState['commits']> {
    if (!base || !head || base === head) {
        return [];
    }

    try {
        const compare = await octokit.rest.repos.compareCommitsWithBasehead({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            basehead: `${base}...${head}`,
            headers: {
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });
        const commits = compare.data.commits;

        core.info(`Found ${commits.length} commits between ${base} and ${head}`);

        return commits.map(commit => ({
            gitsha: commit.sha.slice(0, 7),
            message: (commit.commit?.message ?? '').split('\n')[0]!.trim(),
        }));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        core.warning(`Could not compare commits between ${base} and ${head}: ${message}`);
        return [];
    }
}
