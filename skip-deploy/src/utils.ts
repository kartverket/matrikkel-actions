export function isObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value != null && !Array.isArray(value);
}