import { describe, it, expect, onTestFinished } from 'vitest';
import { Logger } from './log/Logger.ts';
import { Span } from './trace/Span.ts';
import type { ILogger } from './types.ts';
import type { ISpan } from './trace/types.ts';
import type { ILogStorage, LogEntryType } from './log-storage/types.ts';
import type { LogWriteResult } from './failures/types.ts';
import { FailingLogStorage, type HookFailure } from './log-storage/testing-helpers/FailingLogStorage.ts';
import { ForeignLogStorage, type ForeignAddBehaviour } from './log-storage/testing-helpers/ForeignLogStorage.ts';
import { recordFailures } from './log-storage/testing-helpers/results.ts';
import { recordUnhandledRejections } from './log-storage/testing-helpers/recordUnhandledRejections.ts';

type Write<T extends ILogger> = [method: string, level: LogEntryType, write: (logger: T) => Promise<LogWriteResult>];

const messageWrites: Write<ILogger>[] = [
    ['debug', 'debug', logger => logger.debug('m', { a: 1 })],
    ['log', 'info', logger => logger.log('m', { a: 1 })],
    ['warn', 'warn', logger => logger.warn('m', { a: 1 })],
    ['error', 'error', logger => logger.error('m', { a: 1 })],
    ['critical', 'critical', logger => logger.critical('m', { a: 1 })],
    ['debugWithOptions', 'debug', logger => logger.debugWithOptions({ preserve_unmasked_context_paths: [] }, 'm', { a: 1 })],
    ['logWithOptions', 'info', logger => logger.logWithOptions({ preserve_unmasked_context_paths: [] }, 'm', { a: 1 })],
    ['warnWithOptions', 'warn', logger => logger.warnWithOptions({ preserve_unmasked_context_paths: [] }, 'm', { a: 1 })],
    ['errorWithOptions', 'error', logger => logger.errorWithOptions({ preserve_unmasked_context_paths: [] }, 'm', { a: 1 })],
    ['criticalWithOptions', 'critical', logger => logger.criticalWithOptions({ preserve_unmasked_context_paths: [] }, 'm', { a: 1 })],
];

const spanWrites: Write<ISpan>[] = [...messageWrites, ['end', 'event', span => span.end()]];

/**
 * Something that writes, built on a store that is healthy until the test breaks it (so a span's own start
 * is recorded before the write under test).
 */
type Writer = { name: string, source: 'Logger' | 'Span', writes: Write<ILogger>[], build: (storage: ILogStorage) => ILogger };

const writers: Writer[] = [
    { name: 'a logger', source: 'Logger', writes: messageWrites, build: storage => new Logger(storage) },
    // A span's writes are a superset of a logger's; `end` only exists on the span.
    { name: 'a span', source: 'Span', writes: spanWrites as Write<ILogger>[], build: storage => new Span(storage) },
];

const brokenCommits: [string, HookFailure][] = [
    ['throws', { throws: new Error('down') }],
    ['rejects', { rejects: new Error('down') }],
    ['throws a null-prototype object', { throws: Object.create(null) }],
];

const foreignAdds: ForeignAddBehaviour[] = ['throws', 'rejects', 'answers-bare-entry', 'answers-nothing'];


describe.each(writers)('$name writing to a broken store', ({ source, writes, build }) => {

    describe.each(brokenCommits)('built on BaseLogStorage, whose commit %s', (_label, commitEntry) => {

        it.each(writes)('%s resolves the store\'s failed result, carrying the entry, and the store\'s listeners hear it once', async (_method, level, write) => {
            const unhandled = recordUnhandledRejections();
            onTestFinished(unhandled.stop);
            const storage = new FailingLogStorage('my-app');
            const logger = build(storage);
            storage.fail = { commitEntry };
            const failures = recordFailures(storage);

            const result = await write(logger);

            expect(result.ok).toBe(false);
            expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'write', message: 'Could not record the entry.' }]);
            expect(result.entry?.type).toBe(level);
            expect(failures.heard).toHaveLength(1);
            expect(failures.heard[0]).toBe(result.error);
            expect(await unhandled.settled()).toEqual([]);
        });
    });

    describe.each(foreignAdds)('written without BaseLogStorage, whose add %s', (addBehaviour) => {

        it.each(writes)(`%s resolves an unexpected failure from ${source}, handed to the store as the same object`, async (_method, _level, write) => {
            const unhandled = recordUnhandledRejections();
            onTestFinished(unhandled.stop);
            const storage = new ForeignLogStorage(addBehaviour);
            const logger = build(storage);

            const result = await write(logger);

            expect(result.ok).toBe(false);
            expect(result.entry).toBeUndefined();
            expect(result.error?.failures).toEqual([{ source, operation: 'unexpected', message: expect.any(String) }]);
            expect(storage.reported.at(-1)).toBe(result.error);
            expect(await unhandled.settled()).toEqual([]);
        });
    });

    describe('written without BaseLogStorage, whose failure hook breaks too', () => {

        it.each(writes)('%s lists both failures when reportInternalFailure throws, and throws nothing', async (_method, _level, write) => {
            const unhandled = recordUnhandledRejections();
            onTestFinished(unhandled.stop);
            const storage = new ForeignLogStorage('rejects', 'throws');
            const logger = build(storage);

            const result = await write(logger);

            expect(result.error?.failures).toEqual([
                { source, operation: 'unexpected', message: expect.any(String) },
                { source, operation: 'unexpected', message: "The log storage's reportInternalFailure threw." },
            ]);
            expect(await unhandled.settled()).toEqual([]);
        });

        it.each(writes)('%s leaves nothing unhandled when reportInternalFailure rejects', async (_method, _level, write) => {
            const unhandled = recordUnhandledRejections();
            onTestFinished(unhandled.stop);
            const storage = new ForeignLogStorage('rejects', 'rejects');
            const logger = build(storage);

            const result = await write(logger);

            expect(result.error?.failures).toHaveLength(1);
            expect(await unhandled.settled()).toEqual([]);
        });
    });
});


describe.each(writers)('$name writing to a healthy store', ({ writes, build }) => {

    it.each(writes)('%s resolves ok with the recorded entry, and tells the listeners nothing', async (_method, level, write) => {
        const storage = new FailingLogStorage('my-app');
        const logger = build(storage);
        const failures = recordFailures(storage);

        const result = await write(logger);

        expect(result.ok).toBe(true);
        expect(result.entry?.type).toBe(level);
        expect(await storage.get()).toContainEqual(result.entry);
        expect(failures.heard).toEqual([]);
    });

    it('records a write straight away, so a caller that does not await it can read it back', async () => {
        const storage = new FailingLogStorage('my-app');
        const logger = build(storage);

        void logger.log('unawaited');

        expect((await storage.get()).map(entry => entry.message)).toContain('unawaited');
    });
});
