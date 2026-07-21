import {describe, it, expect} from "bun:test";
import {getDeployments} from "./common.ts";

describe('getDeployments', () => {
    it('it should combine resources with variables', async () => {
        const deployments = await Array.fromAsync(
            getDeployments(
                ['README.md', 'package.json'],
                [{ namespace: 'dev' }, { namespace: 'prod' }]
            )
        );
        const readme = await Bun.file('README.md').text();
        const pkg = await Bun.file('package.json').text();

        expect(deployments.length).toBe(4);
        expect(deployments).toEqual([
            { resource: 'README.md', variables: { namespace: 'dev' }, content: readme },
            { resource: 'README.md', variables: { namespace: 'prod' }, content: readme },
            { resource: 'package.json', variables: { namespace: 'dev' }, content: pkg },
            { resource: 'package.json', variables: { namespace: 'prod' }, content: pkg },
        ])
    });
});