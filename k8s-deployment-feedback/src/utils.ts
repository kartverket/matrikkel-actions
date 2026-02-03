import * as core from "@actions/core";

export function fatal(message: string): never {
    core.setFailed(message);
    core.error(message);
    process.exit(1);
}

export function centerFactory(linewidth: number): (text: string) => string {
    return (text: string) => {
        const padding = linewidth - text.length;
        const paddingLeft = ' '.repeat(padding / 2);
        return paddingLeft + text;
    }
}