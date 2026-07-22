import { expect } from 'bun:test';
import * as yaml from 'yaml';
import {
    ApplicationExpansionContext,
} from "../ApplicationExpansionContext.ts";
import {DatabaseMetadata, DatabaseMetadataFile, getNamesFromDBMetadata} from "./databasesRule.ts";
import type { DatabaseMetadataResolver} from "./databasesRule.ts";


export function testContext(manifest: string, dbMetadata: string | null = null): ApplicationExpansionContext {
    const appManifest = yaml.parse(trimIndent(manifest));
    return new ApplicationExpansionContext(
        'dev',
        appManifest,
        [],
        { databases: testDbResolver(dbMetadata) }
    );
}

export function testDbResolver(data: string | null): DatabaseMetadataResolver {
    const parsed = data === null ? null : yaml.parse(data);
    const metadata = DatabaseMetadataFile.safeParse(parsed);
    return async (namespace, databaseName) => {
        if (parsed === null) throw new Error('No Db configured');

        const databasemetadata: DatabaseMetadata | undefined = metadata.data?.databases
            .find(it => getNamesFromDBMetadata(it).includes(databaseName))
        if (databasemetadata == null) throw new Error(`No Db configured named ${databaseName}`);

        return databasemetadata;
    }
}

export function yamlMatch(actual: string, expected: string) {
    expect(
        yaml.parseAllDocuments(trimIndent(actual)).map(it => it.toJSON())
    ).toMatchObject(
        yaml.parseAllDocuments(trimIndent(expected)).map(it => it.toJSON())
    );
}

export function trimIndent(str: string): string {
    const lines = str.replace(/^\n/, "").split("\n")

    const minIndent = lines
        .filter(line => line.trim().length > 0)
        .reduce((min, line) => {
            const indent = line.match(/^ */)?.[0].length ?? 0
            return Math.min(min, indent)
        }, Infinity)

    return lines
        .map(line => line.slice(minIndent))
        .join("\n")
}