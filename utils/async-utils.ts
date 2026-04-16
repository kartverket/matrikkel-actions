import * as core from "@actions/core";

export async function withTimeout<T>(time: number, fn: () => PromiseLike<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`Timed out after ${time}ms`));
        }, time);
    });

    try {
        return await Promise.race([timeout, Promise.resolve(fn())]);
    } finally {
        if (timer != null) {
            clearTimeout(timer);
        }
    }
}

type RetryConfig = {
    count: number;
    delayMs: number;
}
export async function withRetry<T>({ count, delayMs }: RetryConfig, fn: (attempt: number) => PromiseLike<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= count; attempt += 1) {
        try {
            return await fn(attempt);
        } catch (error) {
            lastError = error;
            if (attempt === count) {
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            core.warning(`[RETRY] ${attempt + 1}/${count + 1}: ${message}. Retrying in ${delayMs}ms.`);
            await Bun.sleep(delayMs);
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
