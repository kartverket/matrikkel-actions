import type { WebClient } from "@slack/web-api";
import type {AnyBlock, ContextBlockElement} from "@slack/types/dist/block-kit/blocks";
import type {GitHub} from "@actions/github/lib/utils";
import * as core from "@actions/core";
import * as github from "@actions/github";

export type ApprovalStatus = 'AWAITING' | 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED';
export type ApprovalState = {
    status: ApprovalStatus;
    version: string;
    environment: string;
    commits: Array<{ gitsha: string; message: string; }>;
    approver?: string;
}

export type LaF = { icon: string; color: string; text: string; }
export const LaFLUT: Record<ApprovalStatus, LaF> = {
    AWAITING: {icon: ':hourglass_flowing_sand:', color: '#B0BEC5', text: 'Awaiting approval'},
    RUNNING: {icon: ':rocket:', color: '#42A5F5', text: 'Deploying'},
    SUCCESS: {icon: ':white_check_mark:', color: '#2E7D32', text: 'Success'},
    FAILURE: {icon: ':x:', color: '#D32F2F', text: 'Failure'},
    CANCELLED: {icon: ':stop_sign:', color: '#F6C344', text: 'Cancelled'},
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

function buildMessage(channel: string, state: ApprovalState) {
    const commits: string = state.commits
        .map((it) => `\`${it.gitsha}\` ${it.message}`)
        .join('\n');

    const laf = LaFLUT[state.status];

    const commitBlock: AnyBlock | null = commits.length > 0 ? {
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": commits
        }
    } : null;
    const approverElement: ContextBlockElement | null = state.approver ? {
        "type": "mrkdwn",
        "text": `*Approver:* <https://github.com/${state.approver}|${state.approver}>`
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
                            "text": `${laf.icon} Deployment of ${github.context.repo.repo}:${state.version} to ${state.environment}`
                        }
                    },
                    commitBlock,
                    {
                        "type": "context",
                        "elements": [
                            approverElement,
                            {
                                "type": "mrkdwn",
                                "text": `*Status:* ${laf.text}`
                            },
                            {
                                "type": "mrkdwn",
                                "text": `*Run:* <https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}|${github.context.runId}>`
                            }
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