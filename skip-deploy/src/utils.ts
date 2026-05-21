import * as core from "@actions/core";
import {groupBy, requireNotNull, unique} from "../../utils/fn-utils.ts";
import type {AppDeployDescriptor} from "../../utils/common-types.ts";

export function fatal(message: string): never {
    core.error(message);
    process.exit(1);
}

export type UpdateEntry = AppDeployDescriptor & { originalVersion: string };

export function createCommitMessage(entries: UpdateEntry[]): [string, string] {
    const joiner = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
    const env = unique(entries.map(it => `${it.cluster}:${it.namespace}`));
    const appnames = joiner.format(unique(entries.map(it => it.appname)));

    const summary = `Updated ${appnames} across ${env.length} environment(s)`
    const description: string[] = [];
    const apps = groupBy(entries, it => it.appname);
    for (const [app, appEntries] of Object.entries(apps)) {
        description.push(`Updated ${app}`)
        for (const entry of appEntries) {
            description.push(`${entry.cluster}:${entry.namespace}: ${entry.originalVersion} -> ${entry.version}`)
        }
        description.push('')
    }

    return [summary, description.join('\n')];
}

export function getRequiredInput(name: string): string {
    const input = getInput(name);
    requireNotNull(input, () => `"${name}" is required, but was not set`);
    return input;
}
export function getInput(name: string): string | null {
    return process.env[name.toUpperCase()] || null;
}