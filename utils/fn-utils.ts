export function require(
    value: boolean,
    message: (() => string) = () => "Value is required to be true",
) {
    if (!value) throw new Error(message());
}

export function requireNotNullOrEmpty(
    value: string | null | undefined,
    message?: (() => string)
): asserts value is string {
    requireNotNull(value, message);
    requireNotEmpty(value, message);
}

export function requireNotNull<T>(
    value: T | null | undefined,
    message: (() => string) = () => "Value cannot be null-ish",
): asserts value is T {
    require(value != null, message)
}

export function requireNotEmpty(
    value: string,
    message: (() => string) = () => "Value cannot be empty",
) {
    require(value.trim().length > 0, message)
}

export class Serde<T> {
    constructor(
        public get: (a: T) => string,
        public reverseGet: (b: string) => T,
    ) {}

    serialize(value: T): string {
        return this.get(value)
    }

    deserialize(value: string): T {
        return this.reverseGet(value);
    }
}

export function unique<T>(list: T[]): T[] {
    return Array.from(new Set(list));
}

export function groupBy<TKey extends string, TEl>(list: TEl[], fn: (t: TEl) => TKey): Record<TKey, undefined | TEl[]> {
    return list.reduce((acc, element) => {
        const key = fn(element);
        const group = acc[key] ?? [];
        group.push(element);
        acc[key] = group;
        return acc;
    }, {} as Record<string, TEl[]>)
}