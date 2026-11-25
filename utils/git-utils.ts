import {$} from 'bun';
import * as core from '@actions/core';

export interface PushWithRetryOptions {
    branch: string;
    maxAttempts?: number;
    baseDelayMs?: number;
    cwd?: string;
}

/**
 * Rebaser lokale commits på toppen av origin/<branch> og pusher.
 *
 * Når flere jobber deployer til samme apps-repo samtidig, kan en annen jobb pushe
 * mellom vår `fetch` og `push`. Da avvises pushen (non-fast-forward). I stedet for å
 * feile, henter vi på nytt, rebaser og prøver igjen med eksponentiell backoff + jitter.
 *
 * En ekte rebase-konflikt (to jobber endrer samme linjer i samme fil) kan ikke løses
 * automatisk, og kastes umiddelbart.
 */
export async function pushWithRetry(options: PushWithRetryOptions): Promise<number> {
    const {branch, maxAttempts = 10, baseDelayMs = 1000} = options;
    const cwd = options.cwd ?? process.cwd();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await $`git fetch origin ${branch}`.cwd(cwd).quiet();

        const rebase = await $`git rebase origin/${branch}`.cwd(cwd).nothrow().quiet();
        if (rebase.exitCode !== 0) {
            await $`git rebase --abort`.cwd(cwd).nothrow().quiet();
            throw new Error(`Rebase mot origin/${branch} feilet (konflikt med samtidig deploy?):\n${rebase.stderr.toString()}`);
        }

        const push = await $`git push origin HEAD:${branch}`.cwd(cwd).nothrow().quiet();
        if (push.exitCode === 0) {
            return attempt;
        }

        if (attempt === maxAttempts) {
            throw new Error(`Push til ${branch} feilet etter ${maxAttempts} forsøk:\n${push.stderr.toString()}`);
        }

        const delay = baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs;
        core.warning(`Push til ${branch} ble avvist (forsøk ${attempt}/${maxAttempts}), prøver igjen om ${Math.round(delay)}ms`);
        await Bun.sleep(delay);
    }
    throw new Error('unreachable');
}
