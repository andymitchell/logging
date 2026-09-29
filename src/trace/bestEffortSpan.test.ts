import { describe, it, expect, beforeEach, afterEach, onTestFinished, vi } from 'vitest';
import { bestEffortSpanLog, tryStartSpan, DEFAULT_LOG_TIMEOUT_MS } from './bestEffortSpan.ts';
import { Span } from './Span.ts';
import type { ISpan } from './types.ts';
import { MemoryLogStorage } from '../log-storage/memory/MemoryLogStorage.ts';
import type { ILogStorage } from '../log-storage/types.ts';
import { FailingLogStorage } from '../log-storage/testing-helpers/FailingLogStorage.ts';
import { entriesOf, recordFailures } from '../log-storage/testing-helpers/results.ts';
import type { LogWriteResult } from '../failures/types.ts';
import { recordUnhandledRejections } from '../log-storage/testing-helpers/recordUnhandledRejections.ts';

/**
 * A span from another `ISpan` implementation: it works like a healthy span over `storage`, except for the
 * methods in `replaced`, which do whatever they do here.
 */
function spanFromAnotherImplementation(storage: ILogStorage, replaced: Record<string, () => unknown>): ISpan {
    return new Proxy(new Span(storage), {
        get: (target, property) => {
            if( typeof property === 'string' && Object.hasOwn(replaced, property) ) return replaced[property];
            const value = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}


describe('code logging through bestEffortSpanLog', () => {

    it('waits for the write, so the entry is recorded once it resolves', async () => {
        const storage = new MemoryLogStorage('my-app');
        const span = new Span(storage);

        await bestEffortSpanLog(span, s => s.log('response', { status: 200 }));

        const entries = entriesOf(await storage.get());
        expect(entries.filter(entry => entry.type === 'info').map(entry => [entry.message, entry.context])).toEqual([['response', { status: 200 }]]);
    });

    it('takes no label for reporting failures, because it reports none', async () => {
        // @ts-expect-error `caller` is not an option
        await bestEffortSpanLog(undefined, async () => {}, { caller: 'Checkout.charge' });
    });

    it('resolves straight away without logging when there is no span', async () => {
        let called = false;

        await bestEffortSpanLog(undefined, async () => { called = true; });

        expect(called).toBe(false);
    });

    it('leaves a failed write on a failing store as the only failure the store hears', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new FailingLogStorage('my-app');
        const span = new Span(storage);
        storage.fail = { commitEntry: { rejects: new Error('quota') } };
        const failures = recordFailures(storage);
        let written: LogWriteResult | undefined;

        await bestEffortSpanLog(span, async s => { written = await s.log('response'); });

        expect(written?.ok).toBe(false);
        expect(failures.heard).toEqual([written?.error]);
        expect(await unhandled.settled()).toEqual([]);
    });

    describe('with a span from another implementation whose write fails', () => {

        const failures: [string, () => Promise<unknown>][] = [
            ['throws', () => { throw new Error('boom'); }],
            ['rejects', () => Promise.reject(new Error('boom'))],
            ['rejects with something that is not an Error', () => Promise.reject(Object.create(null))],
        ];

        it.each(failures)('resolves when the write %s, and writes nothing more to the span', async (_label, log) => {
            const unhandled = recordUnhandledRejections();
            onTestFinished(unhandled.stop);
            const storage = new MemoryLogStorage('my-app');
            const span = spanFromAnotherImplementation(storage, { log });

            await bestEffortSpanLog(span, s => s.log('response'));

            const entries = entriesOf(await storage.get());
            expect(entries.map(entry => entry.type)).toEqual(['event']);
            expect(await unhandled.settled()).toEqual([]);
        });
    });

    describe('with a span whose write never finishes', () => {

        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        /** Starts `bestEffortSpanLog` on a span that never answers, and reports whether it has resolved yet. */
        function logToSpanThatNeverAnswers(opts?: { timeoutMs?: number }): { resolved: () => boolean } {
            const span = spanFromAnotherImplementation(new MemoryLogStorage('my-app'), { log: () => new Promise(() => {}) });
            let resolved = false;
            void bestEffortSpanLog(span, s => s.log('response'), opts).then(() => { resolved = true; });
            return { resolved: () => resolved };
        }

        it('gives up waiting after a second by default', async () => {
            const logging = logToSpanThatNeverAnswers();

            await vi.advanceTimersByTimeAsync(DEFAULT_LOG_TIMEOUT_MS - 1);
            const resolvedBeforeTheSecond = logging.resolved();
            await vi.advanceTimersByTimeAsync(1);

            expect(DEFAULT_LOG_TIMEOUT_MS).toBe(1000);
            expect(resolvedBeforeTheSecond).toBe(false);
            expect(logging.resolved()).toBe(true);
        });

        it('gives up waiting after the time it is given', async () => {
            const logging = logToSpanThatNeverAnswers({ timeoutMs: 50 });

            await vi.advanceTimersByTimeAsync(49);
            const resolvedBeforeTheTime = logging.resolved();
            await vi.advanceTimersByTimeAsync(1);

            expect(resolvedBeforeTheTime).toBe(false);
            expect(logging.resolved()).toBe(true);
        });
    });
});


describe('code starting a child span through tryStartSpan', () => {

    it('gets a working child of a built-in span even when the store is failing', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new FailingLogStorage('my-app');
        const parent = new Span(storage);
        storage.fail = { commitEntry: { throws: new Error('quota') } };
        const failures = recordFailures(storage);

        const child = tryStartSpan(parent, 'write', { write_id: 'w1' });
        const written = await child?.log('written');

        expect(child?.getFullId().parent_id).toBe(parent.getId());
        expect(written?.ok).toBe(false);
        // The child's span_start write and its log, each heard once.
        expect(failures.heard).toHaveLength(2);
        expect(failures.heard).toContain(written?.error);
        expect(await unhandled.settled()).toEqual([]);
    });

    it('gets undefined when a span from another implementation throws while starting a child', () => {
        const parent = spanFromAnotherImplementation(new MemoryLogStorage('my-app'), { startSpan: () => { throw new Error('boom'); } });

        expect(tryStartSpan(parent, 'write', { write_id: 'w1' })).toBeUndefined();
    });
});
