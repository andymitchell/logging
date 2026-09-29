import { describe, it, expect, onTestFinished } from 'vitest';
import { Span } from './Span.ts';
import { Trace } from './Trace.ts';
import { startTrace, startTraceWithOptions } from './startTrace.ts';
import { continueTrace } from './continueTrace.ts';
import { isEventLogEntrySpanStart, type ISpan } from './types.ts';
import { Logger } from '../log/Logger.ts';
import { MemoryLogStorage } from '../log-storage/memory/MemoryLogStorage.ts';
import type { ILogStorage } from '../log-storage/types.ts';
import { FailingLogStorage } from '../log-storage/testing-helpers/FailingLogStorage.ts';
import { recordFailures } from '../log-storage/testing-helpers/results.ts';
import { recordUnhandledRejections } from '../log-storage/testing-helpers/recordUnhandledRejections.ts';

const REMOTE_SPAN_ID = { id: 'remote-span', top_id: 'remote-trace' };

/** A store written for a version of this library whose stores could not be told about failures. */
const storeWithoutFailureMethods = {
    add: async () => ({ ok: true }),
    get: async () => [],
    reset: async () => undefined,
    forceClearOldEntries: async () => undefined,
};

describe('an app wiring a logger or span to a store that cannot be told about failures', () => {

    const builds: [string, (storage: ILogStorage) => unknown][] = [
        ['new Logger', storage => new Logger(storage)],
        ['new Span', storage => new Span(storage)],
        ['new Trace', storage => new Trace(storage)],
        ['startTrace', storage => startTrace('checkout', undefined, storage)],
        ['continueTrace', storage => continueTrace(storage, REMOTE_SPAN_ID)],
    ];

    it.each(builds)('%s throws straight away, naming both missing methods', (_label, build) => {
        // @ts-expect-error the store lacks onFailure and reportInternalFailure, so it is not an ILogStorage
        expect(() => build(storeWithoutFailureMethods)).toThrow(/missing onFailure and reportInternalFailure/);
    });

    it('names only the method that is missing', () => {
        const storage = { ...storeWithoutFailureMethods, onFailure: () => () => undefined };

        // @ts-expect-error the store lacks reportInternalFailure
        expect(() => new Logger(storage)).toThrow(/missing reportInternalFailure\./);
    });

    it('throws a TypeError, not a logging failure, when given no store at all', () => {
        // @ts-expect-error undefined is not a store
        expect(() => new Logger(undefined)).toThrow(TypeError);
    });
});


describe('an app starting spans on a store that cannot record them', () => {

    const starts: [string, (storage: ILogStorage) => ISpan, number][] = [
        ['new Span', storage => new Span(storage, undefined, 'work', { a: 1 }), 1],
        ['new Trace', storage => new Trace(storage, 'work', { a: 1 }), 1],
        ['startTrace', storage => startTrace('work', { a: 1 }, storage), 1],
        ['startTraceWithOptions', storage => startTraceWithOptions({ preserve_unmasked_context_paths: [] }, 'work', { a: 1 }, storage), 1],
        ['startSpan', storage => new Trace(storage).startSpan('child', { a: 1 }), 2],
        ['startSpanWithOptions', storage => new Trace(storage).startSpanWithOptions({ preserve_unmasked_context_paths: [] }, 'child', { a: 1 }), 2],
        ['startSpan on a continued trace', storage => continueTrace(storage, REMOTE_SPAN_ID).startSpan('child', { a: 1 }), 1],
    ];

    it.each(starts)('%s returns a span, throws nothing, leaves nothing unhandled, and every failed start is heard on the store', async (_label, start, startsRecorded) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new FailingLogStorage('my-app', { commitEntry: { rejects: new Error('down') } });
        const failures = recordFailures(storage);

        const span = start(storage);

        expect(typeof span.getId()).toBe('string');
        expect(await unhandled.settled(() => failures.heard.length >= startsRecorded)).toEqual([]);
        expect(failures.heard).toHaveLength(startsRecorded);
        expect(failures.heard.every(error => error.failures[0].operation === 'write')).toBe(true);
    });

    it('lets the span log once the store recovers', async () => {
        const storage = new FailingLogStorage('my-app', { commitEntry: { throws: new Error('down') } });
        const span = new Trace(storage, 'work');

        storage.fail = {};
        const result = await span.log('recovered');

        expect(result.ok).toBe(true);
    });

    it('lets a continued trace log, resolving the failure', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new FailingLogStorage('my-app', { commitEntry: { throws: new Error('down') } });

        const result = await continueTrace(storage, REMOTE_SPAN_ID).log('received');

        expect(result.ok).toBe(false);
        expect(await unhandled.settled()).toEqual([]);
    });
});


describe('an app starting a span with a context that cannot be read', () => {

    const unreadable = () => new Proxy({}, {
        get() { throw new Error('trap'); },
        ownKeys() { throw new Error('trap'); },
        getPrototypeOf() { throw new Error('trap'); },
        getOwnPropertyDescriptor() { throw new Error('trap'); },
    });

    const starts: [string, (storage: ILogStorage) => ISpan][] = [
        ['new Trace', storage => new Trace(storage, 'work', unreadable())],
        ['startTrace', storage => startTrace('work', unreadable(), storage)],
        ['startSpan', storage => new Trace(storage).startSpan('work', unreadable())],
        ['startSpan on a continued trace', storage => continueTrace(storage, REMOTE_SPAN_ID).startSpan('work', unreadable())],
    ];

    it.each(starts)('%s still records the span start and returns a span that logs', async (_label, start) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new MemoryLogStorage('my-app');

        const span = start(storage);
        const result = await span.log('inside');

        const spanStarts = (await storage.get()).filter(isEventLogEntrySpanStart).filter(entry => entry.meta?.span.id === span.getId());
        expect(spanStarts).toHaveLength(1);
        expect(result.ok).toBe(true);
        expect(await unhandled.settled()).toEqual([]);
    });
});
