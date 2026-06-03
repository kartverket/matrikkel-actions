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
    manifest: string,
    dependencies: ApplicationExpansionDependencies,
): Promise<ExpandedManifest[]> {
    const docs = yaml.parseAllDocuments(manifest)
        .map(doc => doc.toJSON())
        .filter(Boolean);


    const applicationDocs = docs.filter(it => isObject(it) && it.kind === 'Application');
    const restDocs = docs.filter(it => isObject(it) && it.kind !== 'Application');

    require(applicationDocs.length > 0, () => `Could not find Application manifest`);

    const expanded: ExpandedManifest[] = [];
    for (const app of applicationDocs) {
        const appDoc = structuredClone(app);

        const context = new ApplicationExpansionContext(appDoc, restDocs, dependencies);

        for (const rule of rules) {
            await rule.apply(context);
        }

        expanded.push({ manifest: context.serialize() });
    }
    return expanded;
}