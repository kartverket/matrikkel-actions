import {$} from 'bun';
import * as fs from 'node:fs/promises';
import * as core from '@actions/core';
import {require, requireNotNull, requireNotNullOrEmpty} from "../../utils/fn-utils.ts";
import {createShell} from "@nutgaard/bun-recording-shell";
import {fatal, getInput, getRequiredInput} from "./utils.ts";
import * as yaml from 'yaml'

const workspace = process.env['GITHUB_WORKSPACE'];
if (workspace) {
    // Ensure file operations target the checked-out repo
    process.chdir(workspace);
}

const isDryrun = getInput('dry_run') === 'true';
const isPrintPayload = getInput('print_payload') === 'true';
const cluster = getRequiredInput('cluster');
const resource = getRequiredInput('resource');
const varMatrixStr = getInput('var');

const resources = resource.split(',')
    .map(it => it.trim())
    .filter(Boolean);

require(resources.length > 0, () => `Must provide at least one resource file`)
for (const resource of resources) {
    const file = Bun.file(resource)
    const exists = await file.exists()
    require(exists, () => `"${resource}" was not found`);
}

const varMatrix: Array<Record<string, string>> = (varMatrixStr ?? '')
    .split(/[\r\n,]+/)
    .map(it => it.trim())
    .filter(Boolean)
    .map(line => {
        const vars = line.split(',')
            .map(it => it.trim())
            .map(it => it.split('=').map(i => i.trim()))
        return Object.fromEntries(vars)
    });


for (const resource of resources) {
    const file = Bun.file(resource);
    const content = await file.text();
    for (const vars of varMatrix) {
        const resourceCombination = { resource: content, vars };
        const output = interpolateResource(resourceCombination);
        const file = findFileFor(cluster, output);

        if (!isDryrun) {
            // Atomic writes, to prevent partially written files
            const tmp = `${file}.tmp`;
            await Bun.write(tmp, output);
            await fs.rename(tmp, file);
        }
    }
}

const hasChanges = (await $`git diff --quiet || echo changed`.text()).includes("changed");
if (!hasChanges) {
    core.info(`No changes detected; skipping commit`);
} else if (isDryrun) {
    core.info(`Changes detected; skipping commit`)
} else {
    try {
        await $`git config user.name "Heimdall CI"`;
        await $`git config user.email "spam@kartverket.no"`;
        await $`git commit -am "Deploy of "`;
        await $`git fetch origin main`;
        await $`git rebase origin/main`;
        await $`git push origin main`;
        core.info(`Updated versions`);
    } catch (e: unknown) {
        fatal(`Failed to push changes. Possible conflict with concurrent deployment: ${e}`)
    }
}

const shellRecordingPath = getInput('SHELL_RECORDING_PATH');
const shell = createShell({ mode: 'record', recordingLogPath: shellRecordingPath });


function interpolateResource(input: { resource: string, vars: Record<string, string>}): string {
    return input.resource.replace(
        /{{\s*([^{}]+?)\s*}}/g,
        (_, key: string) => {
            if (!(key in input.vars)) {
                throw new Error(`Missing template variable: ${key}`);
            }
            return input.vars[key]!;
        }
    );
}

function findFileFor(cluster: string, yamlfile: string): string {
    const content = yaml.parse(yamlfile);
    const appname = requireNotNullOrEmpty(content.metadata.name, () => 'Could not find appname in yaml');
    const namespace = requireNotNullOrEmpty(content.metadata.namespace, () => 'Could not find namespace in yaml');
    return `env/${cluster}/${namespace}/${appname}.yaml`;
}