import * as yaml from "yaml";
import z from 'zod';
import { JSONPath } from 'jsonpath-plus';
import {
    ApplicationExpansionContext,
    type ExpansionRule,
} from "../ApplicationExpansionContext.ts";
import {require} from "../../../../utils/fn-utils.ts";
import {addEnvironmentVariable} from "../operations/addEnvironmentVariable.ts";
import {addExternalOutboundAccessPolicy} from "../operations/addAccessPolicy.ts";

const DatabaseMetadataBase = {
    url: z.string(),
    host: z.string(),
    ip: z.string(),
    ports: z.array(
        z.object({
            name: z.string(),
            port: z.number(),
            protocol: z.string(),
        }),
    ),
};

export const DatabaseMetadata = z.union([
    z.object({
        ...DatabaseMetadataBase,
        name: z.string(),
    }).strict(),

    z.object({
        ...DatabaseMetadataBase,
        names: z.array(z.string()),
    }).strict(),
]);

export type DatabaseMetadata = z.infer<typeof DatabaseMetadata>;

export const DatabaseMetadataFile = z.object({
    databases: z.array(DatabaseMetadata)
});
export type DatabaseMetadataFile = z.infer<typeof DatabaseMetadataFile>;

export type DatabaseMetadataResolver = (namespace: string, databaseName: string) => Promise<DatabaseMetadata>;

export type DatabaseRuleDependencies = {
    databases: DatabaseMetadataResolver;
}


const Config = z.object({
    databases: z.array(
        z.xor([
            z.strictObject({
                name: z.string("spec.databases[].name is required").min(1),
                envName: z.string("spec.databases[].envName is required").min(1),
            }),
            z.strictObject({
                name: z.string("spec.databases[].name is required").min(1),
                fields: z.array(
                    z.strictObject({
                        path: z.string('spec.databases[].fields[].path').min(1),
                        envName: z.string("spec.databases[].fields[].envName is required").min(1),
                    })
                ),
            })
        ])
    ).optional()
});

type Config = z.infer<typeof Config>;

export const databasesRule: ExpansionRule = {
    name: 'databases',
    async apply(context: ApplicationExpansionContext): Promise<void> {
        const config: Config = z.parse(Config, context.appManifest.spec)
        if (config.databases == null) return;

        const databases = config.databases;

        for (const database of databases) {
            const metadata = await context.dependencies.databases(context.namespace, database.name);
            const fields = ('fields' in database) ? database.fields : [{ path: '$.url', envName: database.envName }];
            for (const field of fields) {
                const fieldValue = JSONPath({ path: field.path, json: metadata, wrap: false  })
                addEnvironmentVariable(context.appManifest, field.envName, fieldValue);
                context.addSensitiveValue(fieldValue);
            }
            context.addSensitiveValue(metadata.host);
            context.addSensitiveValue(metadata.ip);

            addExternalOutboundAccessPolicy(context.appManifest, {
                host: metadata.host,
                ip: metadata.ip,
                ports: metadata.ports,
            });
        }
        delete context.appManifest.spec?.databases;
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
        const names = getNamesFromDBMetadata(database);
        for (const name of names) {
            require(!metadataByName.has(name), () => `Duplicate database metadata name "${name}" in ${path}`);
            metadataByName.set(name, database);
        }
    }

    return metadataByName;
}

export function getNamesFromDBMetadata(metadata: DatabaseMetadata): string[] {
    if ('name' in metadata) {
        return [metadata.name]
    } else {
        return metadata.names
    }
}