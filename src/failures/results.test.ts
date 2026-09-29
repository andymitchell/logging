import { describe, it, expect, expectTypeOf } from 'vitest';
import { failed } from './results.ts';
import type { LogReadResult, LogWriteResult, LoggingFailure, LoggingResult } from './types.ts';
import type { GetTracesResult } from '../trace/viewing/types.ts';

const quotaFailure: LoggingFailure = {
    source: 'IDBLogStorage:my-app',
    operation: 'write',
    message: 'Could not record the entry in IndexedDB.',
    details: { name: 'QuotaExceededError' },
};
const webhookFailure: LoggingFailure = {
    source: 'WebhookLogStorage:my-app',
    operation: 'write',
    message: 'The webhook rejected the entries.',
    details: { status: 503 },
};

describe('failed', () => {

    describe('a store reporting a failure', () => {

        it('produces a failed result whose error lists the given failures in order', () => {
            const result = failed(quotaFailure, webhookFailure);

            expect(result.ok).toBe(false);
            expect(result.error.failures).toEqual([quotaFailure, webhookFailure]);
        });

        it('passes each failure up as the same object, never a re-described copy', () => {
            const result = failed(quotaFailure, webhookFailure);

            expect(result.error.failures[0]).toBe(quotaFailure);
            expect(result.error.failures[1]).toBe(webhookFailure);
        });

        it('cannot be called without a failure', () => {
            // @ts-expect-error an error names at least one failure
            const call = () => failed();
            void call;
        });
    });

    describe('an app reading the summary message', () => {

        it('names the source and message of a single failure', () => {
            expect(failed(quotaFailure).error.message).toBe('[IDBLogStorage:my-app] Could not record the entry in IndexedDB.');
        });

        it('names every source and message when several sources failed', () => {
            const message = failed(quotaFailure, webhookFailure).error.message;

            for (const failure of [quotaFailure, webhookFailure]) {
                expect(message).toContain(`[${failure.source}] ${failure.message}`);
            }
            expect(message.startsWith('2 logging failures: ')).toBe(true);
        });
    });

    describe('an app forwarding the error to its reporter', () => {

        it('survives a JSON round trip unchanged', () => {
            const result = failed(quotaFailure, webhookFailure);

            expect(JSON.parse(JSON.stringify(result))).toEqual(result);
        });
    });

    describe('a store building the result of any call', () => {

        it('is a complete failed result for writes and admin calls', () => {
            expectTypeOf(failed(quotaFailure)).toExtend<LoggingResult>();
            expectTypeOf(failed(quotaFailure)).toExtend<LogWriteResult>();
        });

        it('needs the obtained entries or traces added before it is a read or trace-search result', () => {
            expectTypeOf(failed(quotaFailure)).not.toExtend<LogReadResult>();
            expectTypeOf(failed(quotaFailure)).not.toExtend<GetTracesResult>();

            expectTypeOf({ ...failed(quotaFailure), entries: [] }).toExtend<LogReadResult>();
            expectTypeOf({ ...failed(quotaFailure), traces: [] }).toExtend<GetTracesResult>();
        });
    });
});
