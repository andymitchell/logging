import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createTraceSearchResultsSchema, TraceSearchResultsSchema, TraceFilterSchema } from './schemas.ts';

/**
 * Anti-regression lockdown for the trace-viewing schemas (search results + filter).
 *
 * Asserts validation OUTCOMES (accept/reject, parsed values, stable error paths),
 * never error message text. TraceFilterSchema composes the external where-filter
 * schema; assertions stay at clearly-valid / clearly-invalid inputs so they hold
 * across the where-filter package swap. Must stay green unchanged on Zod 3 and 4.
 */

const validLog = { type: 'info', ulid: 'u1', timestamp: 1, message: 'm' };
const validResult = { id: 't1', timestamp: 1, logs: [validLog], matches: [validLog] };

describe('Trace search results schema', () => {

    it('accepts a well-formed results array, returning it unchanged', () => {
        const result = TraceSearchResultsSchema.safeParse([validResult]);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).toEqual([validResult]);
    });

    it('accepts an empty results array', () => {
        expect(TraceSearchResultsSchema.safeParse([]).success).toBe(true);
    });

    it('rejects a result missing its matches array, flagging matches', () => {
        const { matches, ...resultWithoutMatches } = validResult;
        const result = TraceSearchResultsSchema.safeParse([resultWithoutMatches]);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues.some(i => i.path.join('.').includes('matches'))).toBe(true);
    });

    it('rejects a single result that is not wrapped in an array', () => {
        expect(TraceSearchResultsSchema.safeParse(validResult).success).toBe(false);
    });

    it('createTraceSearchResultsSchema enforces a caller-supplied context schema', () => {
        const schema = createTraceSearchResultsSchema(z.object({ region: z.string() }));
        const result = { id: 't1', timestamp: 1, logs: [{ type: 'info', ulid: 'u1', timestamp: 1, message: 'm', context: { region: 'eu' } }], matches: [] };
        expect(schema.safeParse([result]).success).toBe(true);
    });

});

describe('Trace filter schema', () => {

    it('accepts an empty filter since every field is optional', () => {
        expect(TraceFilterSchema.safeParse({}).success).toBe(true);
    });

    it('accepts a full-text search string and a simple entries_filter', () => {
        expect(TraceFilterSchema.safeParse({ entries_full_text_search: 'abc' }).success).toBe(true);
        expect(TraceFilterSchema.safeParse({ entries_filter: { type: 'error' } }).success).toBe(true);
    });

    it('rejects a non-string full-text search, flagging the field', () => {
        const result = TraceFilterSchema.safeParse({ entries_full_text_search: 123 });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues.some(i => i.path.join('.') === 'entries_full_text_search')).toBe(true);
    });

});
