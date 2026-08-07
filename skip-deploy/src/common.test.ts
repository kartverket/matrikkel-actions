import {describe, expect, it, spyOn} from "bun:test";
import {getDeployments, interpolate, readAppInputs} from "./common.ts";
import * as yaml from "yaml";

describe('getDeployments', () => {
    it('should combine resources with variables', () => {
        const files = {
            'app.json': 'app-content',
            'proxy.json': 'proxy-content',
        };
        withFilesystem(files, async () => {
            const deployments = await Array.fromAsync(
                getDeployments(
                    ['app.json', 'proxy.json'],
                    [{namespace: 'dev'}, {namespace: 'prod'}]
                )
            );
            expect(deployments.length).toBe(4);
            expect(deployments).toEqual([
                {resource: 'app.json', variables: {namespace: 'dev'}, content: 'app-content'},
                {resource: 'app.json', variables: {namespace: 'prod'}, content: 'app-content'},
                {resource: 'proxy.json', variables: {namespace: 'dev'}, content: 'proxy-content'},
                {resource: 'proxy.json', variables: {namespace: 'prod'}, content: 'proxy-content'},
            ])
        });
    });
});

describe('readAppInputs', () => {
    it('should require cluster as input', () => {
        withEnv({}, async () => {
            expect(readAppInputs).toThrow('"cluster" is required, but was not set');
        });
    });

    it('should require resource as input', () => {
        withEnv({'CLUSTER': 'dev'}, async () => {
            expect(readAppInputs).toThrow('"resource" is required, but was not set');
        })
    });

    it('should fail if resource files are not found', () => {
        const env = {
            'GITHUB_WORKSPACE': process.cwd(),
            'CLUSTER': 'dev',
            'RESOURCE': 'NOT_FOUND.md',
        };
        withFilesystem({}, () =>
            withEnv(env, async () => {
                expect(readAppInputs).toThrow(`"${process.cwd()}/NOT_FOUND.md" was not found`);
            })
        );
    });
    it('should get files relative to the github workspace', () => {
        const files = {
            'app.yaml': '',
            'proxy.yaml': '',
        };
        const env = {
            'GITHUB_WORKSPACE': process.cwd(),
            'CLUSTER': 'dev',
            'RESOURCE': 'app.yaml,proxy.yaml',
        };
        withFilesystem(files, () =>
            withEnv(env, async () => {
                const input = await readAppInputs();
                expect(input.resources).toHaveLength(2);
            })
        );
    });

    it('should parse var-lines', () => {
        const files = {
            'app.yaml': ''
        };
        const env = {
            'GITHUB_WORKSPACE': process.cwd(),
            'CLUSTER': 'dev',
            'RESOURCE': 'app.yaml',
            'VAR': [
                '',
                'abba=true,acdc=kult',
                '',
                'names=ignore,acdc=other',
            ].join('\n')
        };
        withFilesystem(files, () =>
            withEnv(env, async () => {
                const input = await readAppInputs();

                expect(input.resources).toHaveLength(1);
                expect(input.varMatrix).toHaveLength(2);
                expect(input.varMatrix).toMatchObject([
                    { abba: "true", acdc: 'kult' },
                    { names: "ignore", acdc: 'other' },
                ]);
            })
        );
    });

    it('should read var_files', () => {
        const files = {
            'app.yaml': '',
            'betatest.yaml': yaml.stringify({
                namespace: 'betatest',
                format: 'yaml',
            }),
            'prodtest.json': JSON.stringify({
                namespace: 'prodtest',
                format: 'json',
            }),
        };
        const env = {
            'GITHUB_WORKSPACE': process.cwd(),
            'CLUSTER': 'dev',
            'RESOURCE': 'app.yaml',
            'VAR_FILES': 'betatest.yaml,prodtest.json',
            'VAR': [
                '',
                'abba=true,acdc=kult',
                '',
            ].join('\n')
        };
        withFilesystem(files, () =>
            withEnv(env, async () => {
                const input = await readAppInputs();

                expect(input.resources).toHaveLength(1);
                expect(input.varMatrix).toHaveLength(2);
                expect(input.varMatrix).toMatchObject([
                    { namespace: 'betatest', format: 'yaml', abba: "true", acdc: 'kult' },
                    { namespace: 'prodtest', format: 'json', abba: "true", acdc: 'kult' },
                ]);
            })
        );
    });
});

describe('interpolate', () => {
    const template = 'My name is {{name:-Ola}}, I live in {{   location    }}';

    it('should replace variables with values', () => {
        const result = interpolate(template, { name: 'Per', location: 'Oslo' });
        expect(result).toEqual('My name is Per, I live in Oslo');
    });

    it('should throw error if value is not found', () => {
        expect(() => interpolate(template, {}))
            .toThrow('Missing template variable: location');
    });

    it('should use default value', () => {
        const result = interpolate(template, { location: 'Bergen' });
        expect(result).toEqual('My name is Ola, I live in Bergen');
    });
});

async function withEnv(
    env: Record<string, string | undefined>,
    fn:  () => void | Promise<void>,
) {
    const originalEntries: Array<[string, string | undefined]> = Object.keys(env)
        .map((key) => [key, process.env[key]]);

    setEnvEntries(Object.entries(env));
    await fn();
    setEnvEntries(originalEntries);
}

async function withFilesystem(
    filesystem: Record<string, string>,
    fn: () => void | Promise<void>
) {
    const filenames = Object.keys(filesystem);
    const cwd = process.cwd();
    const fileSpy = spyOn(Bun, 'file').mockImplementation((p) => {
        const path = removePrefix(cwd + "/", p.toString());
        const fileExists = filenames.includes(path);
        return {
            async exists(): Promise<boolean> {
                return fileExists;
            },
            async text(): Promise<string> {
                if (!fileExists) return Promise.reject('File not found')
                return Promise.resolve(filesystem[path]!)
            },
            async json(): Promise<any> {
                if (!fileExists) return Promise.reject('File not found')
                return Promise.resolve(JSON.parse(filesystem[path]!));
            },
        } as any;
    });

    try {
        await fn();
    } finally {
        fileSpy.mockRestore();
    }

}
function setEnvEntries(entries: Array<[string, string | undefined]>) {
    for (const [key, value] of entries) {
        process.env[key] = value;
    }
}

function removePrefix(prefix: string, value: string): string {
    if (value.startsWith(prefix)) return value.slice(prefix.length);
    return value;
}