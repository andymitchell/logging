import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createLogEntrySchema, LogEntrySchema, isLogEntry } from './schemas.ts';

/**
 * Anti-regression lockdown for the log-entry validation contract.
 *
 * Asserts validation OUTCOMES (which inputs are accepted/rejected, the parsed
 * values, and — where stable across Zod versions — the error path/code). It
 * deliberately does NOT assert human-readable error message strings, which Zod 4
 * rewords by design. These tests must stay green unchanged on both Zod 3 and 4.
 */

const severities = ['debug', 'info', 'warn', 'error', 'critical'] as const;

describe('Log entry validation contract', () => {

    describe('accepts well-formed entries', () => {

        it('accepts every severity entry, returning it unchanged', () => {
            for (const type of severities) {
                const entry = { type, ulid: 'u1', timestamp: 1, message: `m-${type}` };
                const result = LogEntrySchema.safeParse(entry);
                expect(result.success).toBe(true);
                if (result.success) expect(result.data).toEqual(entry);
            }
        });

        it('accepts the optional context, meta and stack_trace when present', () => {
            const entry = { type: 'debug', ulid: 'u1', timestamp: 1, message: 'hi', context: { a: 1 }, meta: { b: 2 }, stack_trace: 'at x' };
            const result = LogEntrySchema.safeParse(entry);
            expect(result.success).toBe(true);
            if (result.success) expect(result.data).toEqual(entry);
        });

        it('accepts both span lifecycle events, with message remaining optional', () => {
            for (const name of ['span_start', 'span_end'] as const) {
                const entry = { type: 'event', ulid: 'u1', timestamp: 1, event: { name } };
                const result = LogEntrySchema.safeParse(entry);
                expect(result.success).toBe(true);
                if (result.success) expect(result.data).toEqual(entry);
            }
        });

    });

    describe('rejects malformed entries and points at the offending field', () => {

        it('rejects an unrecognised entry type (discriminator)', () => {
            const result = LogEntrySchema.safeParse({ type: 'trace', ulid: 'u1', timestamp: 1, message: 'm' });
            expect(result.success).toBe(false);
        });

        it('rejects a severity entry missing its message, flagging message as a type error', () => {
            const result = LogEntrySchema.safeParse({ type: 'debug', ulid: 'u1', timestamp: 1 });
            expect(result.success).toBe(false);
            if (!result.success) {
                const issue = result.error.issues.find(i => i.path.join('.') === 'message');
                expect(issue).toBeDefined();
                expect(issue?.code).toBe('invalid_type');
            }
        });

        it('rejects a non-string ulid, flagging ulid as a type error', () => {
            const result = LogEntrySchema.safeParse({ type: 'debug', ulid: 123, timestamp: 1, message: 'm' });
            expect(result.success).toBe(false);
            if (!result.success) {
                const issue = result.error.issues.find(i => i.path.join('.') === 'ulid');
                expect(issue?.code).toBe('invalid_type');
            }
        });

        it('rejects an event whose name is not a known span lifecycle event', () => {
            const result = LogEntrySchema.safeParse({ type: 'event', ulid: 'u1', timestamp: 1, event: { name: 'span_paused' } });
            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.issues.some(i => i.path[0] === 'event')).toBe(true);
        });

    });

    describe('isLogEntry type guard', () => {

        it('recognises a valid entry and rejects malformed or non-object input', () => {
            expect(isLogEntry({ type: 'info', ulid: 'u1', timestamp: 1, message: 'm' })).toBe(true);
            expect(isLogEntry({ type: 'info', ulid: 'u1', timestamp: 1 })).toBe(false);
            expect(isLogEntry('not an object')).toBe(false);
            expect(isLogEntry(null)).toBe(false);
        });

    });

    describe('createLogEntrySchema with a caller-supplied context schema', () => {

        it('enforces the supplied context shape rather than accepting any record', () => {
            const schema = createLogEntrySchema(z.object({ userId: z.string() }));

            const ok = schema.safeParse({ type: 'info', ulid: 'u1', timestamp: 1, message: 'm', context: { userId: 'a' } });
            expect(ok.success).toBe(true);

            const bad = schema.safeParse({ type: 'info', ulid: 'u1', timestamp: 1, message: 'm', context: { userId: 5 } });
            expect(bad.success).toBe(false);
            if (!bad.success) expect(bad.error.issues.some(i => i.path.join('.') === 'context.userId')).toBe(true);
        });

    });

});
