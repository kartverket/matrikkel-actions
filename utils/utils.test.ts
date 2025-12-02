import {describe, expect, it} from "bun:test";
import {trimQuotes, versionPathForApp} from "./utils.ts";
import type {AppDeployDescriptor} from "./common-types.ts";

describe('versionPathForApp', () => {
    it('should construct correct path', () => {
        const descriptor: AppDeployDescriptor = {
            cluster: 'prod',
            namespace: 'backend',
            appname: 'api',
            version: '1.0.0'
        };

        expect(versionPathForApp(descriptor)).toBe(
            'env/prod/backend/api/api-version'
        );
    });

    it('should handle different values', () => {
        const descriptor: AppDeployDescriptor = {
            cluster: 'dev',
            namespace: 'frontend',
            appname: 'web-app',
            version: '2.5.3'
        };

        expect(versionPathForApp(descriptor)).toBe(
            'env/dev/frontend/web-app/web-app-version'
        );
    });
});

describe('trimQuotes', () => {
    it('should remove leading and trailing double quotes', () => {
        expect(trimQuotes('"hello"')).toBe('hello');
    });

    it('should remove leading and trailing single quotes', () => {
        expect(trimQuotes("'hello'")).toBe('hello');
    });

    it('should remove only outer quotes', () => {
        expect(trimQuotes('"hello\'world"')).toBe("hello'world");
    });

    it('should handle no quotes', () => {
        expect(trimQuotes('hello')).toBe('hello');
    });

    it('should handle only leading quote', () => {
        expect(trimQuotes('"hello')).toBe('hello');
    });

    it('should handle only trailing quote', () => {
        expect(trimQuotes('hello"')).toBe('hello');
    });

    it('should handle empty string', () => {
        expect(trimQuotes('')).toBe('');
    });
})