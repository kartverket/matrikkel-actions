import {appendFileSync, mkdirSync, readFileSync} from "node:fs";
import {dirname} from "node:path";
import {$ as bunDollar} from "bun";

export type ShellRecordingEntry = {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
};

type BaseShellOptions = {
    cwd?: string;
    env?: Record<string, string | undefined>;
    throws?: boolean;
};

export type CreateShellOptions = BaseShellOptions & (
    { mode: "passthrough" } |
    { mode: "record"; recordingLogPath?: string } |
    ({ mode: "replay" } & (
        { recording: ShellRecordingEntry[] } |
        { recordingLogPath: string }
    ))
);

type ShellExpression = Parameters<typeof bunDollar>[1];
type BunShell = ReturnType<typeof bunDollar>;
type ShellResult = {
    stdout: unknown;
    stderr: unknown;
    exitCode: unknown;
};

type RecordingState = {
    entries: Array<ShellRecordingEntry | null>;
    pending: number;
    logPath?: string;
};

type ReplayState = {
    throws: boolean;
};

type InvocationDriver = {
    run(): Promise<ShellOutputLike>;
    cwd?(newCwd: string): void;
    env?(newEnv: Record<string, string | undefined> | undefined): void;
    quiet?(isQuiet: boolean): void;
    throws(shouldThrow: boolean): void;
};

export type Shell = {
    (strings: TemplateStringsArray, ...expressions: ShellExpression[]): ShellInvocation;
};
export type RecordingShell = Shell & {
    getRecording(): ShellRecordingEntry[];
};
export type CreateShellResult<TOptions extends CreateShellOptions> =
    TOptions extends { mode: "record" } ? RecordingShell : Shell;

export interface ShellOutputLike {
    readonly stdout: Buffer;
    readonly stderr: Buffer;
    readonly exitCode: number;
    text(encoding?: BufferEncoding): string;
    json(): any;
    arrayBuffer(): ArrayBuffer;
    bytes(): Uint8Array<ArrayBuffer>;
    blob(): Blob;
}

export interface ShellInvocation extends PromiseLike<ShellOutputLike> {
    cwd(newCwd: string): this;
    env(newEnv: Record<string, string | undefined> | undefined): this;
    quiet(isQuiet?: boolean): this;
    nothrow(): this;
    throws(shouldThrow: boolean): this;
    text(encoding?: BufferEncoding): Promise<string>;
    json(): Promise<any>;
    arrayBuffer(): Promise<ArrayBuffer>;
    bytes(): Promise<Uint8Array<ArrayBuffer>>;
    blob(): Promise<Blob>;
    catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
    ): Promise<ShellOutputLike | TResult>;
    finally(onfinally?: (() => void) | null): Promise<ShellOutputLike>;
}

class ShellOutput implements ShellOutputLike {
    readonly stdout: Buffer;
    readonly stderr: Buffer;
    readonly exitCode: number;

    constructor(stdout: unknown, stderr: unknown, exitCode: number) {
        this.stdout = toBuffer(stdout);
        this.stderr = toBuffer(stderr);
        this.exitCode = exitCode;
    }

    text(encoding: BufferEncoding = "utf8"): string {
        return this.stdout.toString(encoding);
    }

    json(): any {
        return JSON.parse(this.text());
    }

    arrayBuffer(): ArrayBuffer {
        return this.bytes().buffer.slice(0) as ArrayBuffer;
    }

    bytes(): Uint8Array<ArrayBuffer> {
        return Uint8Array.from(this.stdout) as Uint8Array<ArrayBuffer>;
    }

    blob(): Blob {
        return new Blob([this.bytes()]);
    }
}

export class RecordedShellError extends Error implements ShellOutputLike {
    readonly stdout: Buffer;
    readonly stderr: Buffer;
    readonly exitCode: number;
    readonly command: string;

    constructor(command: string, stdout: unknown, stderr: unknown, exitCode: number) {
        super(`Command failed with exit code ${exitCode}: ${command}`);
        this.name = "RecordedShellError";
        this.command = command;
        this.stdout = toBuffer(stdout);
        this.stderr = toBuffer(stderr);
        this.exitCode = exitCode;
    }

    text(encoding: BufferEncoding = "utf8"): string {
        return this.stdout.toString(encoding);
    }

    json(): any {
        return JSON.parse(this.text());
    }

    arrayBuffer(): ArrayBuffer {
        return this.bytes().buffer.slice(0) as ArrayBuffer;
    }

    bytes(): Uint8Array<ArrayBuffer> {
        return Uint8Array.from(this.stdout) as Uint8Array<ArrayBuffer>;
    }

    blob(): Blob {
        return new Blob([this.bytes()]);
    }
}

export class ReplayMismatchError extends Error {
    constructor(index: number, expectedCommand: string, actualCommand: string) {
        super(`Replay mismatch at entry ${index}: expected "${expectedCommand}" but got "${actualCommand}"`);
        this.name = "ReplayMismatchError";
    }
}

export class ReplayExhaustedError extends Error {
    constructor(index: number, actualCommand: string) {
        super(`Replay exhausted at entry ${index} for command "${actualCommand}"`);
        this.name = "ReplayExhaustedError";
    }
}

export function createShell<TOptions extends CreateShellOptions>(
    options: TOptions = {mode: "passthrough"} as TOptions,
): CreateShellResult<TOptions> {
    if (options.mode === "passthrough") {
        return ((strings: TemplateStringsArray, ...expressions: ShellExpression[]) =>
            createLiveShell(options, strings, expressions) as unknown as ShellInvocation
        ) as CreateShellResult<TOptions>;
    } else if (options.mode === "record") {
        const recording: RecordingState = {
            entries: [],
            pending: 0,
            logPath: options.recordingLogPath,
        };

        const shell = ((strings: TemplateStringsArray, ...expressions: ShellExpression[]) =>
            createInvocation(createRecordDriver(options, recording, strings, expressions))
        ) as RecordingShell;

        shell.getRecording = () => getRecording(recording);

        return shell;
    } else {
        const replay = {index: 0};
        const recording: RecordingState = {
            entries: "recording" in options ? options.recording : readReplayRecording(options.recordingLogPath),
            pending: 0,
            logPath: undefined,
        };
        console.log('recordings', )

        return ((strings: TemplateStringsArray, ...expressions: ShellExpression[]) =>
                createInvocation(createReplayDriver(
                    recording.entries,
                    replay,
                    options.throws ?? true,
                    strings,
                    expressions,
                ))
        ) as CreateShellResult<TOptions>;
    }
}

function getRecording(recording: RecordingState): ShellRecordingEntry[] {
    if (recording.pending > 0) {
        throw new Error("Recording is incomplete while commands are still in flight");
    }

    return recording.entries
        .filter((entry): entry is ShellRecordingEntry => entry !== null)
        .map(entry => ({...entry}));
}

function createInvocation(driver: InvocationDriver): ShellInvocation {
    const invocation: ShellInvocation = {
        cwd(newCwd: string) {
            driver.cwd?.(newCwd);
            return invocation;
        },
        env(newEnv: Record<string, string | undefined> | undefined) {
            driver.env?.(newEnv);
            return invocation;
        },
        quiet(isQuiet: boolean = true) {
            driver.quiet?.(isQuiet);
            return invocation;
        },
        nothrow() {
            driver.throws(false);
            return invocation;
        },
        throws(shouldThrow: boolean) {
            driver.throws(shouldThrow);
            return invocation;
        },
        text(encoding: BufferEncoding = "utf8") {
            invocation.quiet();
            return driver.run().then(output => output.text(encoding));
        },
        json() {
            invocation.quiet();
            return driver.run().then(output => output.json());
        },
        arrayBuffer() {
            invocation.quiet();
            return driver.run().then(output => output.arrayBuffer());
        },
        bytes() {
            invocation.quiet();
            return driver.run().then(output => output.bytes());
        },
        blob() {
            invocation.quiet();
            return driver.run().then(output => output.blob());
        },
        then(onfulfilled, onrejected) {
            return driver.run().then(onfulfilled, onrejected);
        },
        catch(onrejected) {
            return driver.run().catch(onrejected);
        },
        finally(onfinally) {
            return driver.run().finally(onfinally ?? undefined);
        },
    };

    return invocation;
}

function createRecordDriver(
    options: Extract<CreateShellOptions, { mode: "record" }>,
    recording: RecordingState,
    strings: TemplateStringsArray,
    expressions: ShellExpression[],
): InvocationDriver {
    let shell = createLiveShell(options, strings, expressions);
    let cwd = options.cwd;
    let settled: Promise<ShellOutputLike> | undefined;

    return {
        run() {
            if (!settled) {
                const recordIndex = reserveRecording(recording);
                const command = renderCommand(strings, expressions, false);
                settled = runRecordedShell(shell, command, cwd, recording, recordIndex);
            }
            return settled;
        },
        cwd(newCwd: string) {
            cwd = newCwd;
            shell = shell.cwd(newCwd);
        },
        env(newEnv: Record<string, string | undefined> | undefined) {
            shell = shell.env(newEnv);
        },
        quiet(isQuiet: boolean) {
            shell = shell.quiet(isQuiet);
        },
        throws(shouldThrow: boolean) {
            shell = shell.throws(shouldThrow);
        },
    };
}

function createReplayDriver(
    entries: Array<ShellRecordingEntry | null>,
    replay: {index: number},
    initialThrows: boolean,
    strings: TemplateStringsArray,
    expressions: ShellExpression[],
): InvocationDriver {
    const state: ReplayState = {
        throws: initialThrows,
    };
    let settled: Promise<ShellOutputLike> | undefined;

    return {
        run() {
            if (!settled) {
                const command = renderCommand(strings, expressions, true);
                const entry = entries[replay.index];

                if (!entry) {
                    settled = Promise.reject(new ReplayExhaustedError(replay.index, command));
                } else if (entry.command !== command) {
                    settled = Promise.reject(new ReplayMismatchError(replay.index, entry.command, command));
                } else {
                    replay.index += 1;
                    const output = new ShellOutput(entry.stdout, entry.stderr, entry.exitCode);
                    settled = state.throws && output.exitCode !== 0
                        ? Promise.reject(new RecordedShellError(command, output.stdout, output.stderr, output.exitCode))
                        : Promise.resolve(output);
                }
            }

            return settled;
        },
        throws(shouldThrow: boolean) {
            state.throws = shouldThrow;
        },
    };
}

function createLiveShell(
    options: BaseShellOptions,
    strings: TemplateStringsArray,
    expressions: ShellExpression[],
): BunShell {
    let shell = bunDollar(strings, ...expressions);

    if (options.cwd) {
        shell = shell.cwd(options.cwd);
    }
    if (options.env) {
        shell = shell.env(options.env);
    }
    if (options.throws !== undefined) {
        shell = shell.throws(options.throws);
    }

    return shell;
}

async function runRecordedShell(
    shell: BunShell,
    command: string,
    cwd: string | undefined,
    recording: RecordingState,
    recordIndex: number,
): Promise<ShellOutputLike> {
    writeRecordingLog(recording.logPath, {
        timestamp: new Date().toISOString(),
        recordIndex,
        phase: "started",
        command,
        cwd,
    });

    try {
        const result = await shell;
        const output = new ShellOutput(result.stdout, result.stderr, Number(result.exitCode));
        recording.entries[recordIndex] = toRecordingEntry(command, output);
        recording.pending -= 1;
        writeRecordingLog(recording.logPath, {
            timestamp: new Date().toISOString(),
            recordIndex,
            phase: "finished",
            command,
            cwd,
            exitCode: output.exitCode,
            stdout: output.stdout.toString(),
            stderr: output.stderr.toString(),
        });
        return output;
    } catch (error) {
        const wrapped = toRecordedShellError(command, error);
        recording.pending -= 1;

        if (wrapped) {
            recording.entries[recordIndex] = toRecordingEntry(command, wrapped);
            writeRecordingLog(recording.logPath, {
                timestamp: new Date().toISOString(),
                recordIndex,
                phase: "failed",
                command,
                cwd,
                exitCode: wrapped.exitCode,
                stdout: wrapped.stdout.toString(),
                stderr: wrapped.stderr.toString(),
            });
        }

        throw wrapped ?? error;
    }
}

function reserveRecording(recording: RecordingState): number {
    recording.pending += 1;
    recording.entries.push(null);
    return recording.entries.length - 1;
}

function toRecordedShellError(command: string, error: unknown): RecordedShellError | undefined {
    if (!isShellResult(error)) {
        return undefined;
    }

    return new RecordedShellError(command, error.stdout, error.stderr, Number(error.exitCode));
}

function toRecordingEntry(
    command: string,
    result: Pick<ShellOutputLike, "stdout" | "stderr" | "exitCode">,
): ShellRecordingEntry {
    return {
        command,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
        exitCode: result.exitCode,
    };
}

function isShellResult(value: unknown): value is ShellResult {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return "stdout" in candidate && "stderr" in candidate && typeof candidate["exitCode"] === "number";
}

function toBuffer(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (value instanceof Uint8Array) {
        return Buffer.from(value);
    }
    if (value instanceof ArrayBuffer) {
        return Buffer.from(value);
    }
    if (typeof value === "string") {
        return Buffer.from(value, "utf8");
    }
    return Buffer.from(String(value ?? ""), "utf8");
}

type ShellRecordingLogEntry =
    | {
        timestamp: string;
        recordIndex: number;
        phase: "started";
        command: string;
        cwd?: string;
    }
    | {
        timestamp: string;
        recordIndex: number;
        phase: "finished" | "failed";
        command: string;
        cwd?: string;
        exitCode: number;
        stdout: string;
        stderr: string;
    };

function writeRecordingLog(logPath: string | undefined, entry: ShellRecordingLogEntry): void {
    if (!logPath) {
        return;
    }

    mkdirSync(dirname(logPath), {recursive: true});
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function readReplayRecording(logPath: string): ShellRecordingEntry[] {
    return readFileSync(logPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(line => JSON.parse(line) as ShellRecordingLogEntry)
        .filter(it => it.phase === "finished" || it.phase === "failed")
        .map(it => it as Extract<ShellRecordingLogEntry, {phase: "finished" | "failed"}>)
        .sort((a, b) => a.recordIndex - b.recordIndex)
        .map(entry => ({
            command: entry.command,
            stdout: entry.stdout,
            stderr: entry.stderr,
            exitCode: entry.exitCode,
        }));
}

function renderCommand(
    strings: TemplateStringsArray,
    expressions: ShellExpression[],
    rejectUnsupported: boolean,
): string {
    let command = "";

    for (let index = 0; index < strings.length; index += 1) {
        command += strings[index] ?? "";
        if (index < expressions.length) {
            command += renderExpression(expressions[index], rejectUnsupported);
        }
    }

    return command;
}

function renderExpression(expression: ShellExpression, rejectUnsupported: boolean): string {
    if (Array.isArray(expression)) {
        return expression.map(item => renderExpression(item, rejectUnsupported)).join(" ");
    }

    if (isUnsupportedShellExpression(expression)) {
        if (rejectUnsupported) {
            throw new Error(`Unsupported shell interpolation in recording wrapper: ${describeExpression(expression)}`);
        }
        return `[unsupported:${describeExpression(expression)}]`;
    }

    if (typeof expression === "string") {
        return bunDollar.escape(expression);
    }
    if (typeof expression === "number" || typeof expression === "boolean" || typeof expression === "bigint") {
        return bunDollar.escape(String(expression));
    }
    if (expression && typeof expression === "object" && "raw" in expression && typeof expression.raw === "string") {
        return expression.raw;
    }
    if (expression && typeof expression.toString === "function") {
        return bunDollar.escape(expression.toString());
    }

    throw new Error(`Unsupported shell interpolation in recording wrapper: ${describeExpression(expression)}`);
}

function isUnsupportedShellExpression(expression: ShellExpression): boolean {
    if (!expression || Array.isArray(expression)) {
        return false;
    }

    if (typeof ReadableStream !== "undefined" && expression instanceof ReadableStream) {
        return true;
    }
    if (typeof WritableStream !== "undefined" && expression instanceof WritableStream) {
        return true;
    }
    if (typeof expression === "object") {
        const candidate = expression as Record<string, unknown>;
        return "stdin" in candidate
            || "stdout" in candidate
            || "stderr" in candidate
            || typeof candidate["pipeTo"] === "function"
            || typeof candidate["getReader"] === "function";
    }

    return false;
}

function describeExpression(expression: ShellExpression): string {
    if (expression === null) return "null";
    if (expression === undefined) return "undefined";
    if (Array.isArray(expression)) return "array";
    if (typeof expression === "object") return expression.constructor?.name ?? "object";
    return typeof expression;
}
