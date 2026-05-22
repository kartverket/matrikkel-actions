export class Duration {
    static parse(value: string): Duration {
        const numeric = parseInt(value);

        if (value.endsWith('ms')) return Duration.ofMilliseconds(numeric)
        if (value.endsWith('s')) return Duration.ofSeconds(numeric)
        if (value.endsWith('m')) return Duration.ofMinutes(numeric)
        if (value.endsWith('h')) return Duration.ofHours(numeric)

        throw new Error(`Unparseable duration: ${value}`);
    }

    static ofMilliseconds(value: number): Duration {
        return new Duration(value);
    }
    static ofSeconds(value: number): Duration {
        return new Duration(1000 * value);
    }
    static ofMinutes(value: number): Duration {
        return new Duration(60 * 1000 * value);
    }
    static ofHours(value: number): Duration {
        return new Duration(60 * 60 * 1000 * value);
    }

    private constructor(private ms: number) {}

    toWholeMilliseconds(): number {
        return this.ms
    }

    toWholeSeconds(): number {
        return Math.floor(this.ms / 1000);
    }

    toWholeMinutes(): number {
        return Math.floor(this.ms / (60 * 1000));
    }

    toWholeHours(): number {
        return Math.floor(this.ms / (60 * 60 * 1000));
    }
}