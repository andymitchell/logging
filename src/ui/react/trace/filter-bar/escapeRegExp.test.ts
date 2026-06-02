import { describe, it, expect } from 'vitest';
import { matchJavascriptObject } from '@andymitchell/objects/where-filter';
import { escapeRegExp, literalContains } from './escapeRegExp.ts';

/**
 * Intent: the message search box must behave like a literal substring search (the pre-migration
 * `contains`/`indexOf`), even though the where-filter DSL only offers `$regex`. Raw user text in
 * `$regex` would (a) reinterpret metacharacters and (b) throw on invalid patterns. These tests pin
 * that behavior end-to-end through the real matcher (no mocks).
 */
const messageMatchesSearch = (
    message: string,
    search: string,
    opts?: { caseInsensitive?: boolean }
): boolean =>
    matchJavascriptObject<{ message: string }>({ message }, { message: literalContains(search, opts) });

describe('message search behaves as a literal substring, not a regex', () => {

    describe('regex metacharacters are matched literally', () => {
        const metacharSamples = ['a.b', 'a+b', '(x)', 'a|b', 'c[d]', 'cost$', 'a*b', 'who?', '^start', 'back\\slash', 'a{2}'];

        it.each(metacharSamples)('finds %j when the message literally contains it', (sample) => {
            expect(messageMatchesSearch(`before ${sample} after`, sample)).toBe(true);
        });

        it('treats "." as a literal dot rather than an any-character wildcard', () => {
            expect(messageMatchesSearch('a.b', 'a.b')).toBe(true);
            expect(messageMatchesSearch('axb', 'a.b')).toBe(false);
        });

        it('treats "(x)" as literal parentheses rather than a capture group', () => {
            expect(messageMatchesSearch('the (x) value', '(x)')).toBe(true);
            expect(messageMatchesSearch('the x value', '(x)')).toBe(false);
        });
    });

    describe('input that is invalid as a raw regex never throws', () => {
        // Before escaping, a lone "(" or "[" made the matcher throw a SyntaxError.
        const invalidRawRegex = ['(', '[', ')', '*', '+', '?', 'a(b', 'c[d', '\\'];

        it.each(invalidRawRegex)('does not throw for %j', (sample) => {
            expect(() => messageMatchesSearch('any message', sample)).not.toThrow();
        });

        it('still matches the offending character literally', () => {
            expect(messageMatchesSearch('a ( b', '(')).toBe(true);
            expect(messageMatchesSearch('a [ b', '[')).toBe(true);
            expect(messageMatchesSearch('no parens here', '(')).toBe(false);
        });
    });

    describe('letter-case handling', () => {
        it('is case-sensitive by default, matching the pre-migration behavior', () => {
            expect(messageMatchesSearch('Error: boom', 'Error')).toBe(true);
            expect(messageMatchesSearch('Error: boom', 'error')).toBe(false);
        });

        it('matches case-insensitively only when explicitly opted in', () => {
            expect(messageMatchesSearch('Error: boom', 'error', { caseInsensitive: true })).toBe(true);
            expect(messageMatchesSearch('ERROR: BOOM', 'error', { caseInsensitive: true })).toBe(true);
        });
    });
});

describe('escapeRegExp turns text into a pattern that matches that exact text', () => {
    const samples = ['plain', 'a.b', 'a+b(c)', 'user@host', 'C:\\path\\file', '[a-z]*', 'cost is $5 (approx)', 'q?=1&r=2'];

    it.each(samples)('round-trips %j as an exact literal match', (sample) => {
        expect(new RegExp(`^${escapeRegExp(sample)}$`).test(sample)).toBe(true);
    });

    it('does not let a metacharacter widen the match beyond the literal text', () => {
        const pattern = new RegExp(`^${escapeRegExp('a.c')}$`);
        expect(pattern.test('a.c')).toBe(true);
        expect(pattern.test('abc')).toBe(false);
    });
});
