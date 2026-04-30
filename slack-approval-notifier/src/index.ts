import * as core from "@actions/core";
import {
    type ApprovalState,
    type ApprovalStatus,
    getApprovers,
    getCommitsBetweenVersions,
    getCurrentVersionFromAppsRepo,
    LaFLUT,
    postMessage,
    updateMessage
} from "./utils.js";
import {WebClient} from "@slack/web-api";
import * as github from "@actions/github";
import {type AppDeployDescriptor, AppDeployDescriptorSerde} from "../../utils/common-types.ts";

function readStatus(): ApprovalStatus {
    const status = core.getInput('status', {required: false}) || 'AWAITING';
    if (Object.keys(LaFLUT).includes(status)) {
        return status as ApprovalStatus;
    }
    if (Object.keys(LaFLUT).includes(status.toUpperCase())) {
        return status.toUpperCase() as ApprovalStatus;
    }

    core.setFailed(`Invalid status: ${status}`);
    process.exit(1);
}

function readCommitsFromState(): ApprovalState['commits'] | undefined {
    const commitsState = core.getState('commits');
    core.debug(`commits: ${commitsState}`);
    if (!commitsState) {
        return undefined;
    }
    return JSON.parse(commitsState) as ApprovalState['commits'];
}

async function resolveCommits(
    octokit: ReturnType<typeof github.getOctokit>,
    appsRepoOctokit: ReturnType<typeof github.getOctokit>,
    descriptor: AppDeployDescriptor
): Promise<ApprovalState['commits']> {
    const previousVersion = await getCurrentVersionFromAppsRepo(appsRepoOctokit, descriptor);
    if (!previousVersion) {
        core.error('Could not find previous version in production');
        process.exit(1);
    }

    return getCommitsBetweenVersions(octokit, previousVersion, descriptor.version);
}

async function run() {
    try {
        const messageId = core.getInput('messageId', { required: false });
        const isUpdateStep = messageId !== '';

        const isPostStep = core.getState('is_post') == 'true';
        const approvedAt = core.getInput('approvedAt', { required: false });
        core.saveState('is_post', 'true');

        const token = process.env.SLACK_BOT_TOKEN;
        if (!token) {
            core.setFailed("Slack token is required (env: SLACK_BOT_TOKEN).");
            return;
        }
        const client = new WebClient(token);

        const ghToken = process.env.GITHUB_TOKEN;
        if (!ghToken) {
            core.setFailed('Could not find github token environment variable (env: GITHUB_TOKEN).')
            return;
        }
        const octokit = github.getOctokit(ghToken)

        const channel = core.getInput("channel", {required: true});
        const appsRepoDescriptor = AppDeployDescriptorSerde.deserialize(core.getInput('appDescriptor', { required: true }));

        const state: ApprovalState = {
            environment: core.getInput('environment', {required: true}),
            version: appsRepoDescriptor.version,
            status: isPostStep ? readStatus() : (isUpdateStep ? 'RUNNING' : 'AWAITING'),
            commits: readCommitsFromState() ?? [],
        }

        core.info(`IsPostStep: ${isPostStep}`)
        core.info(`Commits: ${state.commits.length}`)
        if (!isPostStep && state.commits.length == 0) {
            const appsRepoToken = process.env.APPS_REPO_TOKEN;
            if (!appsRepoToken) {
                core.setFailed('Could not find apps-repo token environment variable (env: APPS_REPO_TOKEN).')
                return;
            }
            const appsRepoOctokit = github.getOctokit(appsRepoToken);

            state.commits = await resolveCommits(
                octokit,
                appsRepoOctokit,
                appsRepoDescriptor,
            );
            core.saveState('commits', JSON.stringify(state.commits));
        }

        const approvers = await getApprovers(octokit);
        if (approvers.length > 0) {
            state.approver = approvers[0]!.user.login;
            if (approvedAt === '') {
                const now = new Date();
                state.approvedAt = now;
                core.saveState('approvedAt', now.toISOString());
            } else {
                state.approvedAt = new Date(approvedAt);
            }
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
