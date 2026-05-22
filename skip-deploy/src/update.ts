import {$} from 'bun';
import * as fs from 'node:fs/promises';
import * as core from '@actions/core';
import {findAppDescriptor, interpolateResource, readAppInputs} from "./common.ts";
import {fatal, getInput} from "../../utils/utils.ts";

const workspace = process.env['GITHUB_WORKSPACE'];
if (workspace) {
    // Ensure file operations target the checked-out repo
    process.chdir(`${workspace}/apps-repo`);
}

const isDryrun = getInput('dry_run') === 'true';
const isPrintPayload = getInput('print_payload') === 'true';
const { cluster, resources, varMatrix  } = await readAppInputs();

for (const resource of resources) {
    const file = Bun.file(resource);
    const content = await file.text();
    for (const vars of varMatrix) {
        const output = interpolateResource({resource: content, vars});
        const file = findFileFor(cluster, output);

        if (isPrintPayload) {
            core.info(`${file}:`);
            core.info(output + '\n\n');
        }

        if (!isDryrun) {
            // Atomic writes, to prevent partially written files
            const tmp = `${file}.tmp`;
            await Bun.write(tmp, output);
            await fs.rename(tmp, file);
        }
    }
}

const hasChanges = (await $`git status --porcelain`.text()).trim().length > 0;
if (!hasChanges) {
    core.info(`No changes detected; skipping commit`);
} else if (isDryrun) {
    core.info(`Changes detected; skipping commit`)
} else {
    try {
        await $`git config user.name "Heimdall CI"`;
        await $`git config user.email "spam@kartverket.no"`;
        await $`git add env`;
        await $`git commit -m "Deploy of apps"`;
        await $`git fetch origin main`;
        await $`git rebase origin/main`;
        await $`git push origin main`;
        core.info(`Updated versions`);
    } catch (e: unknown) {
        fatal(`Failed to push changes. Possible conflict with concurrent deployment: ${e}`)
    }
}

function findFileFor(cluster: string, yamlfile: string): string {
    const { namespace, appname } = findAppDescriptor(yamlfile);
    return `env/${cluster}/${namespace}/${appname}.yaml`;
}