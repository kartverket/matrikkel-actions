import { describe, it, expect } from 'bun:test';
import {
    trimQuotes,
    versionPathForApp,
    ImageDescriptorSerde,
    AppDeployDescriptorSerde,
    type AppDeployDescriptor,
    type UpdateEntry,
    createCommitMessage,
} from './utils.ts';

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
});

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

describe('ImageDescriptorSerde', () => {
    it('should serialize image descriptor with quotes', () => {
        const descriptor = {
            name: 'myapp',
            version: '1.0.0'
        };

        expect(ImageDescriptorSerde.serialize(descriptor)).toBe('"myapp:1.0.0"');
    });

    it('should deserialize quoted image descriptor', () => {
        const result = ImageDescriptorSerde.deserialize('"myapp:1.0.0"');

        expect(result.name).toBe('myapp');
        expect(result.version).toBe('1.0.0');
    });

    it('should deserialize unquoted image descriptor', () => {
        const result = ImageDescriptorSerde.deserialize('myapp:1.0.0');

        expect(result.name).toBe('myapp');
        expect(result.version).toBe('1.0.0');
    });

    it('should handle image with registry and port', () => {
        const result = ImageDescriptorSerde.deserialize('"registry.example.com:5000/myapp:v1.2.3"');

        expect(result.name).toBe('registry.example.com:5000/myapp');
        expect(result.version).toBe('v1.2.3');
    });

    it('should handle image with multiple colons in name', () => {
        const result = ImageDescriptorSerde.deserialize('"host:port/path:1.0.0"');

        expect(result.name).toBe('host:port/path');
        expect(result.version).toBe('1.0.0');
    });

    it('should handle whitespace', () => {
        const result = ImageDescriptorSerde.deserialize('  "myapp:1.0.0"  ');

        expect(result.name).toBe('myapp');
        expect(result.version).toBe('1.0.0');
    });

    it('should be reversible', () => {
        const original = { name: 'myapp', version: '1.0.0' };
        const serialized = ImageDescriptorSerde.serialize(original);
        const deserialized = ImageDescriptorSerde.deserialize(serialized);
        const reserialized = ImageDescriptorSerde.serialize(deserialized);

        expect(reserialized).toBe(serialized);
    });

    it('should throw on empty name', () => {
        expect(() => ImageDescriptorSerde.deserialize(':1.0.0')).toThrow();
    });

    it('should throw on empty version', () => {
        expect(() => ImageDescriptorSerde.deserialize('myapp:')).toThrow();
    });
});

describe('AppDeployDescriptorSerde', () => {
    it('should serialize app deploy descriptor', () => {
        const descriptor: AppDeployDescriptor = {
            cluster: 'prod',
            namespace: 'backend',
            appname: 'api',
            version: '1.0.0'
        };

        expect(AppDeployDescriptorSerde.serialize(descriptor)).toBe(
            'prod:backend:api:1.0.0'
        );
    });

    it('should deserialize app deploy descriptor', () => {
        const result = AppDeployDescriptorSerde.deserialize('prod:backend:api:1.0.0');

        expect(result.cluster).toBe('prod');
        expect(result.namespace).toBe('backend');
        expect(result.appname).toBe('api');
        expect(result.version).toBe('1.0.0');
    });

    it('should trim whitespace from parts', () => {
        const result = AppDeployDescriptorSerde.deserialize('  prod : backend : api : 1.0.0  ');

        expect(result.cluster).toBe('prod');
        expect(result.namespace).toBe('backend');
        expect(result.appname).toBe('api');
        expect(result.version).toBe('1.0.0');
    });

    it('should be reversible', () => {
        const original: AppDeployDescriptor = {
            cluster: 'prod',
            namespace: 'backend',
            appname: 'api',
            version: '1.0.0'
        };
        const serialized = AppDeployDescriptorSerde.serialize(original);
        const deserialized = AppDeployDescriptorSerde.deserialize(serialized);
        const reserialized = AppDeployDescriptorSerde.serialize(deserialized);

        expect(reserialized).toBe(serialized);
    });

    it('should throw on invalid format (too few parts)', () => {
        expect(() => AppDeployDescriptorSerde.deserialize('prod:backend:api')).toThrow('Invalid descriptor');
    });

    it('should throw on invalid format (too many parts)', () => {
        expect(() => AppDeployDescriptorSerde.deserialize('prod:backend:api:1.0.0:extra')).toThrow('Invalid descriptor');
    });

    it('should throw on empty cluster', () => {
        expect(() => AppDeployDescriptorSerde.deserialize(':backend:api:1.0.0')).toThrow();
    });

    it('should throw on empty namespace', () => {
        expect(() => AppDeployDescriptorSerde.deserialize('prod::api:1.0.0')).toThrow();
    });

    it('should throw on empty appname', () => {
        expect(() => AppDeployDescriptorSerde.deserialize('prod:backend::1.0.0')).toThrow();
    });

    it('should throw on empty version', () => {
        expect(() => AppDeployDescriptorSerde.deserialize('prod:backend:api:')).toThrow();
    });

    it('should throw on whitespace-only parts', () => {
        expect(() => AppDeployDescriptorSerde.deserialize('prod:   :api:1.0.0')).toThrow();
    });

    it('should handle complex version strings', () => {
        const result = AppDeployDescriptorSerde.deserialize('prod:backend:api:v1.2.3-alpha+build.123');

        expect(result.version).toBe('v1.2.3-alpha+build.123');
    });
});

describe('createCommitMessage', () => {
    it ('should return all apps, and count unique environments', () => {
        const [summary] = createCommitMessage([
            updateEntry('cluster1:namespace1:app1:1.0.0'),
            updateEntry('cluster1:namespace1:app2:1.0.0'),
            updateEntry('cluster1:namespace1:app3:1.0.0'),
        ]);
        expect(summary).toBe('Updated app1, app2, and app3 across 1 environment(s)')
    });

    it ('should return all apps, and count unique environments', () => {
        const [summary] = createCommitMessage([
            updateEntry('cluster1:namespace1:app1:1.0.0'),
            updateEntry('cluster1:namespace2:app2:1.0.0'),
        ]);
        expect(summary).toBe('Updated app1 and app2 across 2 environment(s)')
    });

    it ('should description of each app deployed', () => {
        const [_,description] = createCommitMessage([
            updateEntry('cluster1:namespace1:app1:1.0.0'),
            updateEntry('cluster1:namespace2:app1:1.1.1'),
            updateEntry('cluster1:namespace2:app2:1.0.0'),
        ]);
        expect(description).toBe([
            'Updated app1',
            'cluster1:namespace1: old_version -> 1.0.0',
            'cluster1:namespace2: old_version -> 1.1.1',
            '',
            'Updated app2',
            'cluster1:namespace2: old_version -> 1.0.0',
            '',
        ].join('\n'));
    });


    const updateEntry = (val: string): UpdateEntry => {
        const app = AppDeployDescriptorSerde.deserialize(val);
        return { ...app, originalVersion: 'old_version' }
    }
});