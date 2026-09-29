import { describe, it, expect, onTestFinished } from 'vitest';
import { Logger } from './log/Logger.ts';
import { Span } from './trace/Span.ts';
import { TraceViewer } from './trace/viewing/TraceViewer.ts';
import type { ILogStorage } from './log-storage/types.ts';
import type { LoggingResult } from './failures/types.ts';
import { FailingLogStorage, type HookFailure } from './log-storage/testing-helpers/FailingLogStorage.ts';
import { ForeignLogStorage, type ForeignBehaviour } from './log-storage/testing-helpers/ForeignLogStorage.ts';
import { recordFailures } from './log-storage/testing-helpers/results.ts';
import { recordUnhandledRejections } from './log-storage/testing-helpers/recordUnhandledRejections.ts';

/**
 * What a read resolved, and what it found: the entries, or the traces for a trace viewer.
 */
type ReadOutcome = { result: LoggingResult, found: unknown[] };

/**
 * Something that reads a store. `read` builds it while the store is healthy, writing one entry (a span's own
 * start), and returns the read under test.
 */
type Reader = { name: string, source: 'Logger' | 'Span' | 'TraceViewer', read: (storage: ILogStorage) => () => Promise<ReadOutcome> };

const readers: Reader[] = [
    { name: 'a logger', source: 'Logger', read: storage => {
        const logger = new Logger(storage);
        void logger.log('seed');
        return async () => { const result = await logger.get(); return { result, found: result.entries }; };
    } },
    { name: 'a span', source: 'Span', read: storage => {
        const span = new Span(storage);
        return async () => { const result = await span.get(); return { result, found: result.entries }; };
    } },
    { name: 'a trace viewer', source: 'TraceViewer', read: storage => {
        new Span(storage);
        const viewer = new TraceViewer(storage);
        return async () => { const result = await viewer.getTraces(); return { result, found: result.traces }; };
    } },
];

const brokenReads: [string, HookFailure<never>][] = [
    ['throws', { throws: new Error('down') }],
    ['rejects', { rejects: new Error('down') }],
    ['throws a null-prototype object', { throws: Object.create(null) }],
];

const foreignReads: ForeignBehaviour[] = ['throws', 'rejects', 'answers-old-shape', 'answers-nothing'];


describe.each(readers)('$name reading from a broken store', ({ source, read }) => {

    it.each(brokenReads)('built on BaseLogStorage, whose read %s: resolves the store\'s failure with nothing found, heard once', async (_label, queryEntries) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new FailingLogStorage('my-app');
        const readNow = read(storage);
        storage.fail = { queryEntries };
        const failures = recordFailures(storage);

        const { result, found } = await readNow();

        expect(result.ok).toBe(false);
        expect(found).toEqual([]);
        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'read', message: 'Could not read the entries.' }]);
        expect(failures.heard).toHaveLength(1);
        expect(failures.heard[0]?.failures[0]).toBe(result.error?.failures[0]);
        expect(await unhandled.settled()).toEqual([]);
    });

    it.each(foreignReads)(`written without BaseLogStorage, whose get %s: resolves an unexpected failure from ${source}, handed to the store`, async (behaviour) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new ForeignLogStorage('answers-old-shape');
        const readNow = read(storage);
        storage.behaviour = behaviour;

        const { result, found } = await readNow();

        expect(result.ok).toBe(false);
        expect(found).toEqual([]);
        expect(result.error?.failures).toEqual([{ source, operation: 'unexpected', message: expect.any(String) }]);
        // Found by identity: the unawaited write made while building may report after the read does.
        expect(storage.reported.map(error => error.failures[0])).toContain(result.error?.failures[0]);
        expect(await unhandled.settled()).toEqual([]);
    });

    it('lists both failures when the foreign store\'s reportInternalFailure throws too, and throws nothing', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new ForeignLogStorage('answers-old-shape', 'throws');
        const readNow = read(storage);
        storage.behaviour = 'rejects';

        const { result } = await readNow();

        expect(result.error?.failures).toEqual([
            { source, operation: 'unexpected', message: expect.any(String) },
            { source, operation: 'unexpected', message: "The log storage's reportInternalFailure threw." },
        ]);
        expect(await unhandled.settled()).toEqual([]);
    });
});


describe.each(readers)('$name reading from a healthy store', ({ read }) => {

    it('resolves ok with what it found, and tells the listeners nothing', async () => {
        const storage = new FailingLogStorage('my-app');
        const readNow = read(storage);
        const failures = recordFailures(storage);

        const { result, found } = await readNow();

        expect(result.ok).toBe(true);
        expect(result.error).toBeUndefined();
        expect(found.length).toBeGreaterThan(0);
        expect(failures.heard).toEqual([]);
    });
});
