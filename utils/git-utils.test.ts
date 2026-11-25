import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {$} from 'bun';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {pushWithRetry} from './git-utils.ts';

let root: string;
let remote: string;

async function clone(name: string): Promise<string> {
    const dir = path.join(root, name);
    await $`git clone -q ${remote} ${dir}`.quiet();
    // Isoler fra utviklerens globale gitconfig (f.eks. commit.gpgsign gjør hver commit/rebase treg og kan be om passphrase)
    await $`git config user.name test && git config user.email test@example.com && git config commit.gpgsign false`.cwd(dir).quiet();
    return dir;
}

async function commitFile(dir: string, file: string, content: string) {
    await fs.mkdir(path.dirname(path.join(dir, file)), {recursive: true});
    await Bun.write(path.join(dir, file), content);
    await $`git add -A && git commit -q -m ${'update ' + file}`.cwd(dir).quiet();
}

beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'git-utils-test-'));
    remote = path.join(root, 'remote.git');
    await $`git init -q --bare -b main ${remote}`.quiet();
    const seed = await clone('seed');
    await commitFile(seed, 'README.md', 'init');
    await $`git push -q origin HEAD:main`.cwd(seed).quiet();
});

afterEach(async () => {
    await fs.rm(root, {recursive: true, force: true});
});

describe('pushWithRetry', () => {
    test('pusher når ingen andre har endret remote', async () => {
        const a = await clone('a');
        await commitFile(a, 'env/app-a.yaml', 'a');
        expect(await pushWithRetry({branch: 'main', cwd: a, baseDelayMs: 1})).toBe(1);
    });

    test('håndterer at en annen jobb har pushet etter at vi klonet', async () => {
        const a = await clone('a');
        const b = await clone('b');
        await commitFile(a, 'env/app-a.yaml', 'a');
        await commitFile(b, 'env/app-b.yaml', 'b');

        await pushWithRetry({branch: 'main', cwd: b, baseDelayMs: 1});
        await pushWithRetry({branch: 'main', cwd: a, baseDelayMs: 1});

        const verify = await clone('verify');
        expect(await Bun.file(path.join(verify, 'env/app-a.yaml')).text()).toBe('a');
        expect(await Bun.file(path.join(verify, 'env/app-b.yaml')).text()).toBe('b');
    });

    test('mange parallelle deploys lykkes alle', async () => {
        const n = 4;
        const clones: string[] = [];
        for (let i = 0; i < n; i++) {
            const dir = await clone(`c${i}`);
            await commitFile(dir, `env/app-${i}.yaml`, `${i}`);
            clones.push(dir);
        }

        await Promise.all(clones.map(dir => pushWithRetry({branch: 'main', cwd: dir, baseDelayMs: 5})));

        const verify = await clone('verify');
        for (let i = 0; i < n; i++) {
            expect(await Bun.file(path.join(verify, `env/app-${i}.yaml`)).text()).toBe(`${i}`);
        }
    }, 30_000);

    test('kaster ved ekte konflikt og etterlater ikke repoet midt i en rebase', async () => {
        const a = await clone('a');
        const b = await clone('b');
        await commitFile(a, 'env/same.yaml', 'a');
        await commitFile(b, 'env/same.yaml', 'b');

        await pushWithRetry({branch: 'main', cwd: b, baseDelayMs: 1});
        await expect(pushWithRetry({branch: 'main', cwd: a, baseDelayMs: 1})).rejects.toThrow(/Rebase/);

        const status = await $`git status`.cwd(a).text();
        expect(status).not.toContain('rebase in progress');
    });
});
