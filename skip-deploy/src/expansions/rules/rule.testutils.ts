import { expect } from 'bun:test';
import * as yaml from 'yaml';
import {
    ApplicationExpansionContext,
} from "../ApplicationExpansionContext.ts";
import type {DatabaseMetadata, DatabaseMetadataResolver} from "./databasesRule.ts";


export function testContext(manifest: string, dbMetadata: string | null = null): ApplicationExpansionContext {
    const appManifest = yaml.parse(trimIndent(manifest));
    return new ApplicationExpansionContext(
        appManifest,
        [],
        { databases: testDbResolver(dbMetadata) }
    );
}

export function testDbResolver(data: string | null): DatabaseMetadataResolver {
    const parsed = data === null ? null : yaml.parse(data);
    return async (namespace, databaseName) => {
        if (parsed === null) throw new Error('No Db configured');
        return parsed.databases.find((it: any) => it.name === databaseName) as DatabaseMetadata;
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