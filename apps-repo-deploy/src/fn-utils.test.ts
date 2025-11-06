import {describe, expect, it} from 'bun:test';
import {require, requireNotEmpty, requireNotNull, requireNotNullOrEmpty, Serde} from './fn-utils.ts';

describe('require', () => {
    it('should throw if value is false', () => {
        expect(() => require(false)).toThrow('Value is required to be true');
    });

    it('should throw with custom message if value is false', () => {
        expect(() => require(false, () => 'Custom error')).toThrow('Custom error');
    });

    it('should do nothing if value is true', () => {
        expect(() => require(true)).not.toThrow();
    });
});

describe('requireNotNullOrEmpty', () => {
    it('should throw if value is null', () => {
        expect(() => requireNotNullOrEmpty(null)).toThrow('Value cannot be null-ish');
    });

    it('should throw if value is undefined', () => {
        expect(() => requireNotNullOrEmpty(undefined)).toThrow('Value cannot be null-ish');
    });

    it('should throw if value is empty', () => {
        expect(() => requireNotNullOrEmpty('')).toThrow('Value cannot be empty');
    });

    it('should throw if value is blank (whitespace only)', () => {
        expect(() => requireNotNullOrEmpty('   ')).toThrow('Value cannot be empty');
    });

    it('should do nothing if value is a string with some content', () => {
        expect(() => requireNotNullOrEmpty('hello')).not.toThrow();
        expect(() => requireNotNullOrEmpty('  hello  ')).not.toThrow();
    });
});

describe('requireNotNull', () => {
    it('should throw if value is null', () => {
        expect(() => requireNotNull(null)).toThrow('Value cannot be null-ish');
    });

    it('should throw if value is undefined', () => {
        expect(() => requireNotNull(undefined)).toThrow('Value cannot be null-ish');
    });

    it('should throw with custom message if value is null', () => {
        expect(() => requireNotNull(null, () => 'Custom null error')).toThrow('Custom null error');
    });

    it('should do nothing if value is not null-ish', () => {
        expect(() => requireNotNull('')).not.toThrow();
        expect(() => requireNotNull(0)).not.toThrow();
        expect(() => requireNotNull(false)).not.toThrow();
        expect(() => requireNotNull('hello')).not.toThrow();
        expect(() => requireNotNull({})).not.toThrow();
    });
});

describe('requireNotEmpty', () => {
    it('should throw if string is empty', () => {
        expect(() => requireNotEmpty('')).toThrow('Value cannot be empty');
    });

    it('should throw if string is blank (whitespace only)', () => {
        expect(() => requireNotEmpty('   ')).toThrow('Value cannot be empty');
        expect(() => requireNotEmpty('\n\t  ')).toThrow('Value cannot be empty');
    });

    it('should throw with custom message if string is empty', () => {
        expect(() => requireNotEmpty('', () => 'Custom empty error')).toThrow('Custom empty error');
    });

    it('should do nothing if string has some content', () => {
        expect(() => requireNotEmpty('hello')).not.toThrow();
        expect(() => requireNotEmpty('  hello  ')).not.toThrow();
        expect(() => requireNotEmpty('a')).not.toThrow();
    });
});

describe('serde', () => {
    type Person = { name: string; age: number };

    const personSerde = new Serde<Person>(
        (p) => `${p.name},${p.age}`,
        (s) => {
            const [name, age] = s.split(',');
            return {name, age: parseInt(age)};
        }
    );

    it('should be able to serialize/deserialize', () => {
        const person = {name: 'Alice', age: 30};
        const serialized = personSerde.serialize(person);
        expect(serialized).toBe('Alice,30');

        const deserialized = personSerde.deserialize(serialized);
        expect(deserialized).toEqual(person);
    });
});