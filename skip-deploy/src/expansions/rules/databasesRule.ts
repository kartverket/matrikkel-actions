import * as yaml from "yaml";
import {
    ApplicationExpansionContext,
    type DatabaseMetadataResolver,
    type ExpansionRule,
    type ExternalPort
} from "../ApplicationExpansionContext.ts";
import {require, requireNotNullOrEmpty} from "../../../../utils/fn-utils.ts";
import {isObject} from "../../utils.ts";

export type DatabaseMetadata = {
    readonly name: string;
    readonly url: string;
    readonly host: string;
    readonly ip: string;
    readonly ports: ExternalPort[];
}

export const databasesRule: ExpansionRule = {
    name: 'databases',
    async apply(context: ApplicationExpansionContext): Promise<void> {
        const databases = context.appDoc.spec?.databases;
        if (databases == null) return;

        require(Array.isArray(databases), () => `spec.databases must be a list`);

        for (const database of databases) {
            require(isObject(database), () => `spec.databases[] must be an object`);
            requireNoDatabaseSourceFields(database);
            requireNotNullOrEmpty(database.name, () => `spec.databases[].name is required`);
            requireNotNullOrEmpty(database.envName, () => `spec.databases[].envName is required`);


            const metadata = await context.dependencies.databases(context.namespace, database.name);
            context.addEnvValue(database.envName, metadata.url);
            context.addSensitiveValue(metadata.url);
            context.addSensitiveValue(metadata.host);
            context.addSensitiveValue(metadata.ip);

            context.appDoc.spec.accessPolicy ??= {};
            context.appDoc.spec.accessPolicy.outbound ??= {};
            context.appDoc.spec.accessPolicy.outbound.external ??= [];
            context.appDoc.spec.accessPolicy.outbound.external.push({
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

function requireNoDatabaseSourceFields(database: Record<string, unknown>) {
    const forbiddenFields = ['gsmMetadataSecret', 'host', 'ip', 'ports', 'url'];
    for (const field of forbiddenFields) {
        require(database[field] == null, () => `spec.databases[] must not contain ${field}; use apps-repo database metadata`);
    }
}

async function readNamespaceDatabaseMetadata(path: string): Promise<Map<string, DatabaseMetadata>> {
    const file = Bun.file(path);
    const exists = await file.exists();
    require(exists, () => `Database metadata file ${path} was not found`);

    const content = yaml.parse(await file.text());
    require(isObject(content), () => `Database metadata file ${path} must contain a YAML object`);
    require(Array.isArray(content.databases), () => `Database metadata file ${path} must contain databases list`);

    const metadataByName = new Map<string, DatabaseMetadata>();
    for (const metadata of content.databases) {
        validateDatabaseMetadata(metadata, path);
        require(!metadataByName.has(metadata.name), () => `Duplicate database metadata name "${metadata.name}" in ${path}`);
        metadataByName.set(metadata.name, metadata);
    }

    return metadataByName;
}

function validateDatabaseMetadata(metadata: any, source: string): asserts metadata is DatabaseMetadata {
    require(isObject(metadata), () => `Database metadata in ${source} must be an object`);
    requireNotNullOrEmpty(metadata.name, () => `Database metadata in ${source} must contain name`);
    requireNotNullOrEmpty(metadata.url, () => `Database metadata ${metadata.name} in ${source} must contain url`);
    requireNotNullOrEmpty(metadata.host, () => `Database metadata ${metadata.name} in ${source} must contain host`);
    requireNotNullOrEmpty(metadata.ip, () => `Database metadata ${metadata.name} in ${source} must contain ip`);
    require(Array.isArray(metadata.ports) && metadata.ports.length > 0, () => `Database metadata ${metadata.name} in ${source} must contain non-empty ports`);
    for (const port of metadata.ports) {
        // validateExternalPort(port, `Database metadata ${metadata.name} in ${source} ports[]`);
    }
}