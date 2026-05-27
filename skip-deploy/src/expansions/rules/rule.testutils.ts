import { expect } from 'bun:test';
import * as yaml from 'yaml';
import {ApplicationExpansionContext, type DatabaseMetadataResolver} from "../ApplicationExpansionContext.ts";
import type {DatabaseMetadata} from "./databasesRule.ts";


export function testContext(doc: string, dbMetadata: string | null = null): ApplicationExpansionContext {
    const appDoc = yaml.parse(doc);
    return new ApplicationExpansionContext(
        appDoc,
        'main',
        'appname',
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
        yaml.parseAllDocuments(trimIndent(actual)).map(doc => doc.toJSON())
    ).toMatchObject(
        yaml.parseAllDocuments(trimIndent(expected)).map(doc => doc.toJSON())
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