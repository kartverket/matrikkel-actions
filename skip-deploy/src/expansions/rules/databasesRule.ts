import * as yaml from "yaml";
import z from 'zod';
import {
    ApplicationExpansionContext,
    DatabaseMetadata,
    type DatabaseMetadataResolver, DatabaseMetadataFile,
    type ExpansionRule,
} from "../ApplicationExpansionContext.ts";
import {require} from "../../../../utils/fn-utils.ts";
import {addEnvironmentVariable} from "../operations/addEnvironmentVariable.ts";
import {addExternalOutboundAccessPolicy} from "../operations/addAccessPolicy.ts";

const Config = z.object({
    databases: z.array(
        z.strictObject({
            name: z.string("spec.databases[].name is required").min(1),
            envName: z.string("spec.databases[].envName is required").min(1),
        })
    ).optional()
});

type Config = z.infer<typeof Config>;

export const databasesRule: ExpansionRule = {
    name: 'databases',
    async apply(context: ApplicationExpansionContext): Promise<void> {
        const config: Config = z.parse(Config, context.appDoc.spec)
        if (config.databases == null) return;

        const databases = config.databases;

        for (const database of databases) {
            const metadata = await context.dependencies.databases(context.namespace, database.name);
            addEnvironmentVariable(context.appDoc, database.envName, metadata.url);
            context.addSensitiveValue(metadata.url);
            context.addSensitiveValue(metadata.host);
            context.addSensitiveValue(metadata.ip);

            addExternalOutboundAccessPolicy(context.appDoc, {
                host: metadata.host,
                ip: metadata.ip,
                ports: metadata.ports,
            });
        }
        delete context.appDoc.spec?.databases;
    }
}

export function createAppsRepoDatabaseMetadataResolver(
    cluster: string,
    appsRepoRoot = '.'
): DatabaseMetadataResolver {
    const cache = new Map<string, Promise<Map<string, DatabaseMetadata>>>();

    return async (namespace: string, databaseName: string) => {
        const metadataByName = await loadNamespaceDatabaseMetadata(cluster, namespace, appsRepoRoot, cache);
        const metadata = metadataByName.get(databaseName);
        require(metadata != null, () => `Could not find database metadata for "${databaseName}" in env/${cluster}/${namespace}/database-metadata.yaml`);
        return metadata!;
    };
}

async function loadNamespaceDatabaseMetadata(
    cluster: string,
    namespace: string,
    appsRepoRoot: string,
    cache: Map<string, Promise<Map<string, DatabaseMetadata>>>
): Promise<Map<string, DatabaseMetadata>> {
    const path = `${appsRepoRoot}/env/${cluster}/${namespace}/database-metadata.yaml`;
    let metadata = cache.get(path);
    if (metadata == null) {
        metadata = readNamespaceDatabaseMetadata(path);
        cache.set(path, metadata);
    }
    return metadata;
}

async function readNamespaceDatabaseMetadata(path: string): Promise<Map<string, DatabaseMetadata>> {
    const file = Bun.file(path);
    const exists = await file.exists();
    require(exists, () => `Database metadata file ${path} was not found`);

    const content = yaml.parse(await file.text());
    const metadata = z.parse(DatabaseMetadataFile, content);

    const metadataByName = new Map<string, DatabaseMetadata>();
    for (const database of metadata.databases) {
        require(!metadataByName.has(database.name), () => `Duplicate database metadata name "${database.name}" in ${path}`);
        metadataByName.set(database.name, database);
    }

    return metadataByName;
}
