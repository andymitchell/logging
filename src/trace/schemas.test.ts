import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SpanIdSchema, SpanMetaSchema, ILoggerSchema, ISpanSchema } from './schemas.ts';

/**
 * Anti-regression lockdown for the span/logger schemas.
 *
 * Asserts validation OUTCOMES (accept/reject + stable error path/code), never
 * error message text. For the logger/span schemas it asserts only acceptance,
 * rejection, and nesting — NOT the identity of returned function members, since
 * Zod 3 wraps function members on parse while Zod 4 does not. Must stay green
 * unchanged on both Zod 3 and 4.
 */

const validSpanId = { id: 's1', top_id: 't1' };

const loggerMembers = { debug() {}, log() {}, warn() {}, error() {}, critical() {}, get() {} };
const spanMembers = { ...loggerMembers, startSpan() {}, end() {}, getId() { return ''; }, getFullId() { return validSpanId; } };

describe('Span identity schema', () => {

    it('accepts an id with or without the optional parent_id', () => {
        expect(SpanIdSchema.safeParse(validSpanId).success).toBe(true);
        expect(SpanIdSchema.safeParse({ ...validSpanId, parent_id: 'p1' }).success).toBe(true);
    });

    it('rejects a missing required id, flagging it as a type error', () => {
        const result = SpanIdSchema.safeParse({ top_id: 't1' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.error.issues.find(i => i.path.join('.') === 'id');
            expect(issue?.code).toBe('invalid_type');
        }
    });

});

describe('Span meta wrapper schema', () => {

    it('accepts a well-formed span meta object', () => {
        const result = SpanMetaSchema.safeParse({ type: 'span', span: validSpanId });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).toEqual({ type: 'span', span: validSpanId });
    });

    it('rejects a wrong type discriminator, flagging the type field', () => {
        const result = SpanMetaSchema.safeParse({ type: 'trace', span: validSpanId });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues.some(i => i.path.join('.') === 'type')).toBe(true);
    });

});

describe('Logger and span surface schemas — members must be callable', () => {

    it('accepts an object whose logger members are all functions', () => {
        expect(ILoggerSchema.safeParse(loggerMembers).success).toBe(true);
    });

    it('accepts the wider span surface', () => {
        expect(ISpanSchema.safeParse(spanMembers).success).toBe(true);
    });

    it('rejects when a member is present but not a function', () => {
        expect(ILoggerSchema.safeParse({ ...loggerMembers, error: 'nope' }).success).toBe(false);
    });

    it('rejects when a required member is absent', () => {
        const { get, ...missingGet } = loggerMembers;
        expect(ILoggerSchema.safeParse(missingGet).success).toBe(false);
    });

    it('nests as an optional member of another schema, mirroring consumer usage', () => {
        const Holder = z.object({ span: ISpanSchema.optional() });
        expect(Holder.safeParse({ span: spanMembers }).success).toBe(true);
        expect(Holder.safeParse({}).success).toBe(true);
        expect(Holder.safeParse({ span: { ...spanMembers, end: 5 } }).success).toBe(false);
    });

});
