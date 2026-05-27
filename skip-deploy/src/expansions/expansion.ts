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

export type ExpandedManifest = {
    readonly manifest: string;
}

const rules: ExpansionRule[] = [
    envGsmSecretRule,
    databasesRule,
];

export async function expandKubernetesManifests(
    manifest: string,
    dependencies: ApplicationExpansionDependencies,
): Promise<ExpandedManifest[]> {
    const docs = yaml.parseAllDocuments(manifest)
        .map(doc => doc.toJSON())
        .filter(Boolean);

    const applicationDocs = docs.filter(function (doc: any): boolean {
        return isObject(doc) && doc.kind === 'Application';
    });
    require(applicationDocs.length > 0, () => `Could not find Application manifest`);

    const expanded: ExpandedManifest[] = [];
    for (const app of applicationDocs) {
        const appDoc = structuredClone(app);
        const namespace = appDoc.metadata?.namespace;
        const appname = appDoc.metadata?.name;

        requireNotNullOrEmpty(namespace, () => 'Could not find namespace in yaml');
        requireNotNullOrEmpty(appname, () => 'Could not find appname in yaml');

        const context = new ApplicationExpansionContext(appDoc, namespace, appname, dependencies);

        for (const rule of rules) {
            await rule.apply(context);
        }

        expanded.push({ manifest: context.serialize() });
    }

    return expanded;
}