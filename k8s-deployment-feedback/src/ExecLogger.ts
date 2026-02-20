import * as fs from "node:fs";
import * as core from '@actions/core';

export class ExecLogger {
    private readonly outputDir = process.env.CAPTURE_DIR ?? "capture";
    private readonly entries: Map<string, number> = new Map();

    append(args: string[], result: string) {
        this.ensureOutputDir();
        const argline = args.join(' ');
        const hasher = new Bun.CryptoHasher('sha256');
        hasher.update(argline)
        const hash = hasher.digest('hex');
        const key = [hash, argline].join('||');

        const count = this.entries.get(key) ?? 0;
        const filename = `${hash}-${count}`;
        fs.writeFileSync(`${this.outputDir}/${filename}`, result);
        core.debug(`Captured exec-cmd: "${argline}", written to ${this.outputDir}/${filename}`)
        this.entries.set(key, count + 1);
    }

    private getMeta(): string {
        const metalines: string[] = [];
        for (const entry of this.entries.keys()) {
            const [hash, cmd] = entry.split('||');
            metalines.push(''+cmd);
            metalines.push('\t' + hash);
            metalines.push('');
        }
        return metalines.join('\n');
    }

    async writeToDir() {
        this.ensureOutputDir();
        await Bun.write(`${this.outputDir}/meta.txt`, this.getMeta());
    }

    private ensureOutputDir() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }
}
