import * as yaml from "yaml";
import {require, requireNotNullOrEmpty} from "../../../utils/fn-utils.ts";
import {
    ApplicationExpansionContext,
    type ApplicationExpansionDependencies,
    type ExpansionRule,
} from "./ApplicationExpansionContext.ts";
import {envGsmSecretRule} from "./rules/envGsmSecretRule.ts";
import {isObject} from "../utils.ts";
import {databasesRule} from "./rules/databasesRule.ts";
import {azureApplicationRule} from "./rules/azureApplicationRule.ts";

export type ExpandedManifest = {
    readonly manifest: string;
}

const rules: ExpansionRule[] = [
    envGsmSecretRule,
    databasesRule,
    azureApplicationRule
];

export async function expandKubernetesManifests(
    cluster: string,
    manifest: string,
    dependencies: ApplicationExpansionDependencies,
): Promise<ExpandedManifest[]> {
    const manifests = yaml.parseAllDocuments(manifest)
        .map(it => it.toJSON())
        .filter(Boolean);


    const applicationManifests = manifests.filter(it => isObject(it) && it.kind === 'Application');
    const restManifests = manifests.filter(it => isObject(it) && it.kind !== 'Application');

    require(applicationManifests.length > 0, () => `Could not find Application manifest`);

    const expanded: ExpandedManifest[] = [];
    for (const appManifest of applicationManifests) {
        const context = new ApplicationExpansionContext(cluster, appManifest, restManifests, dependencies);

        for (const rule of rules) {
            await rule.apply(context);
        }

        expanded.push({ manifest: context.serialize() });
    }
    return expanded;
}