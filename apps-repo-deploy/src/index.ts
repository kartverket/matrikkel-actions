import {$} from 'bun';
import * as fs from 'node:fs/promises';
import * as core from '@actions/core';
import {
    AppDeployDescriptorSerde,
    type AppDeployDescriptor,
    fatal,
    ImageDescriptorSerde,
    versionPathForApp
} from "./utils.ts";
import {require} from "./fn-utils.ts";

const workspace = process.env['GITHUB_WORKSPACE'];
if (workspace) {
    // Ensure file operations target the checked-out repo
    process.chdir(workspace);
}

const isDryrun = core.getInput('dryrun', {required: false}) === 'true';
const logprefix = isDryrun ? '[DRYRUN] ' : '';
const appsString = core.getInput('apps', {required: true});
const apps: AppDeployDescriptor[] = appsString
    .split(/[\r\n,]+/)
    .map(it => it.trim())
    .filter(Boolean)
    .map(it => AppDeployDescriptorSerde.deserialize(it));

if (apps.length === 0) {
    fatal(`No apps to deploy`);
}

for (const app of apps) {
    const versionFilePath = versionPathForApp(app);
    const versionFile = Bun.file(versionFilePath);
    const exists = await versionFile.exists();
    require(exists, () => `Could not find version file ${versionFilePath} (${AppDeployDescriptorSerde.serialize(app)})`);

    const imageDescriptorStr = (await versionFile.text()).trim()
    const imageDescriptor = ImageDescriptorSerde.deserialize(imageDescriptorStr);
    const newImageDescriptor = {...imageDescriptor, version: app.version};
    const newImageDescriptorStr = ImageDescriptorSerde.serialize(newImageDescriptor);

    if (!isDryrun) {
        // Atomic writes, to prevent partially written files
        const tmpFile = `${versionFilePath}.tmp`;
        await Bun.write(tmpFile, newImageDescriptorStr);
        await fs.rename(tmpFile, versionFilePath);
    }
    core.info(`${logprefix}Updated version ${versionFilePath}: ${imageDescriptorStr} -> ${newImageDescriptorStr}`);
}

const hasChanges = (await $`git diff --quiet || echo changed`.text()).includes("changed");
if (!hasChanges) {
    core.info(`${logprefix}No changes detected; skipping commit`);
} else if (isDryrun) {
    core.info(`${logprefix}Changes detected; skipping commit`)
} else {
    try {
        await $`git config user.name "Heimdall CI"`;
        await $`git config user.email "spam@kartverket.no"`;
        await $`git commit -am "Updated ${apps.length} versions" -m "versions: ${appsString}"`;
        await $`git fetch origin main`;
        await $`git rebase origin/main`;
        await $`git push origin main`;
        core.info(`Updated ${apps.length} versions`);
    } catch (e: unknown) {
        fatal(`Failed to push changes. Possible conflict with concurrent deployment: ${e}`)
    }
}

core.summary.addHeading(`${logprefix}Apps updated (${apps.length})`);
core.summary.addCodeBlock(
    apps.map(it => AppDeployDescriptorSerde.serialize(it)).join('\n'),
    'text'
);
await core.summary.write();
