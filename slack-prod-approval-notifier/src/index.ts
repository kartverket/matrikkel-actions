import * as core from "@actions/core";
import {
    type ApprovalState,
    type ApprovalStatus,
    getApprovers,
    LaFLUT,
    postMessage,
    updateMessage
} from "./utils.js";
import {WebClient} from "@slack/web-api";
import * as github from "@actions/github";

function readStatus(): ApprovalStatus {
    const status = core.getInput('status', {required: false}) ?? 'AWAITING';
    if (Object.keys(LaFLUT).includes(status)) {
        return status as ApprovalStatus;
    }
    if (Object.keys(LaFLUT).includes(status.toUpperCase())) {
        return status.toUpperCase() as ApprovalStatus;
    }

    core.setFailed(`Invalid status: ${status}`);
    process.exit(1);
}

async function run() {
    try {
        const token = process.env.SLACK_BOT_TOKEN;
        if (!token) {
            core.setFailed("Slack token is required (env: SLACK_BOT_TOKEN).");
            process.exit(1);
        }
        const client = new WebClient(token);

        const ghToken = process.env.GITHUB_TOKEN;
        if (!ghToken) {
            core.setFailed('Could not find github token environment variable (env: GITHUB_TOKEN).')
            process.exit(1)
        }
        const octokit = github.getOctokit(ghToken)

        const channel = core.getInput("channel", {required: true});
        const state: ApprovalState = {
            environment: core.getInput('environment', {required: true}),
            version: core.getInput('version', {required: true}),
            status: readStatus(),
            approver: '', // Never set during setup
            commits: [] // TODO(Ignore for now, would have to parse content in apps-repo to get the previous version)
        }
        const messageId = core.getInput('messageId', { required: false });

        const approvers = await getApprovers(octokit);
        if (approvers.length > 0) {
            state.approver = approvers[0]!.login;
        }

        let newMessageId: string | undefined;
        if (messageId) {
            const { ts } = await updateMessage(client, channel, messageId, state);
            newMessageId = ts;
        } else {
            const { ts } = await postMessage(client, channel, state);
            newMessageId = ts;
        }

        core.setOutput("messageId", newMessageId);
    } catch (error) {
        core.setFailed(error instanceof Error ? error.message : String(error));
    }
}

await run();
