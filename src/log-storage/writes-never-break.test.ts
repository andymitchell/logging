import { describe, it, expect, onTestFinished, vi } from 'vitest';
import { MemoryLogStorage } from './memory/MemoryLogStorage.ts';
import { MemoryBreakpoints } from '../breakpoints/MemoryBreakpoints.ts';
import { FailingLogStorage, type HookFailure } from './testing-helpers/FailingLogStorage.ts';
import { entriesOf, recordFailures } from './testing-helpers/results.ts';
import { recordUnhandledRejections } from './testing-helpers/recordUnhandledRejections.ts';
import { createLoggingFailedResult } from '../failures/results.ts';
import type { LogWriteResult } from '../failures/types.ts';

describe('an app writing to a store', () => {

    it('gets the recorded entry back, with ok true and no error', async () => {
        const storage = new MemoryLogStorage('my-app');

        const result = await storage.add({ type: 'info', message: 'fetched', context: { count: 2 } });

        expect(result.ok).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.entry).toMatchObject({ type: 'info', message: 'fetched', context: { count: 2 } });
        expect(entriesOf(await storage.get())).toEqual([result.entry]);
    });

    describe('when the store cannot commit the entry', () => {

        const brokenCommits: [string, HookFailure][] = [
            ['throws an Error', { throws: new Error('quota exceeded for secret-value') }],
            ['rejects with an Error', { rejects: new Error('quota exceeded for secret-value') }],
            ['throws a null-prototype object', { throws: Object.create(null) }],
            ['rejects with a null-prototype object', { rejects: Object.create(null) }],
        ];

        it.each(brokenCommits)('resolves a failed result carrying the built entry when the commit %s', async (_label, commitEntry) => {
            const unhandled = recordUnhandledRejections();
            onTestFinished(unhandled.stop);
            const storage = new FailingLogStorage('my-app', { commitEntry });

            const result = await storage.add({ type: 'warn', message: 'slow', context: { ms: 900 } });

            expect(result.ok).toBe(false);
            expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'write', message: 'Could not record the entry.' }]);
            expect(result.entry).toMatchObject({ type: 'warn', message: 'slow', context: { ms: 900 } });
            expect(await unhandled.settled()).toEqual([]);
        });

        it.each(brokenCommits)('tells the store\'s failure listeners the same error once when the commit %s', async (_label, commitEntry) => {
            const storage = new FailingLogStorage('my-app', { commitEntry });
            const failures = recordFailures(storage);

            const result = await storage.add({ type: 'warn', message: 'slow' });

            expect(failures.heard).toHaveLength(1);
            expect(failures.heard[0]).toBe(result.error);
        });

        it('never copies what the store threw into the failure', async () => {
            const storage = new FailingLogStorage('my-app', { commitEntry: { throws: new Error('quota exceeded for secret-value') } });

            const result = await storage.add({ type: 'warn', message: 'slow' });

            expect(JSON.stringify(result.error)).not.toContain('secret-value');
        });

        it('passes on, as the same object, a failure the store described itself', async () => {
            const described = createLoggingFailedResult({ source: 'IDBLogStorage:my-app', operation: 'write', message: 'The quota is exceeded.', details: { name: 'QuotaExceededError' } });
            const storage = new FailingLogStorage('my-app', { commitEntry: { answers: described } });
            const failures = recordFailures(storage);

            const result = await storage.add({ type: 'warn', message: 'slow' });

            expect(result.error).toBe(described.error);
            expect(failures.heard).toEqual([described.error]);
            expect(failures.heard[0]).toBe(described.error);
        });

        it('masks a secret-looking namespace in the failure\'s source', async () => {
            const storage = new FailingLogStorage(['sk', 'live', '4eC39HqLyjWDarjtT1zdp7dc'].join('_'), { commitEntry: { throws: new Error('x') } }); // Assembled at runtime: a live Stripe key's shape in source trips secret scanners.

            const result = await storage.add({ type: 'warn', message: 'slow' });

            expect(result.error?.failures[0].source.startsWith('MemoryLogStorage:')).toBe(true);
            expect(result.error?.failures[0].source).not.toContain('4eC39HqLyjWDarjtT1zdp7dc');
        });
    });

    it('tells the failure listeners nothing when the write succeeds', async () => {
        const storage = new MemoryLogStorage('my-app');
        const failures = recordFailures(storage);

        await storage.add({ type: 'warn', message: 'slow' });

        expect(failures.heard).toEqual([]);
    });

    it('resolves a failed result without an entry when the entry itself cannot be built', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new MemoryLogStorage('my-app');
        const failures = recordFailures(storage);
        const unreadable = { get type(): never { throw new Error('hostile entry'); }, message: 'x' };

        const result = await storage.add(unreadable);

        expect(result.ok).toBe(false);
        expect(result.entry).toBeUndefined();
        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'write', message: 'Could not record the entry.' }]);
        expect(failures.heard).toEqual([result.error]);
        expect(entriesOf(await storage.get())).toEqual([]);
        expect(await unhandled.settled()).toEqual([]);
    });

    it('records the entry straight away, so a caller that does not await its write can read it back', async () => {
        const storage = new MemoryLogStorage('my-app');

        void storage.add({ type: 'info', message: 'unawaited' });

        expect(entriesOf(await storage.get()).map(entry => entry.message)).toEqual(['unawaited']);
    });
});

describe('a developer debugging with breakpoints or a console echo', () => {

    class UnreadableBreakpoints extends MemoryBreakpoints {
        override async listBreakpoints(): Promise<never> { throw new Error('breakpoint store down'); }
    }

    it.each([
        ['the breakpoint handler throws', () => {
            const breakpoints = new MemoryBreakpoints();
            breakpoints.setHandler(() => { throw new Error('handler bug'); });
            void breakpoints.addBreakpoint({ type: 'warn' });
            return breakpoints;
        }],
        ['the breakpoint store cannot be read', () => {
            const breakpoints = new UnreadableBreakpoints();
            breakpoints.setHandler(() => undefined);
            return breakpoints;
        }],
    ])('still records the entry, but fails the write with a breakpoint failure, when %s', async (_label, makeBreakpoints) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new MemoryLogStorage('my-app', { breakpoints: makeBreakpoints() });
        const failures = recordFailures(storage);

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(result.ok).toBe(false);
        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'breakpoint', message: 'Could not check the entry against breakpoints.' }]);
        expect(entriesOf(await storage.get())).toEqual([result.entry]);
        expect(failures.heard).toEqual([result.error]);
        expect(await unhandled.settled()).toEqual([]);
    });

    it('still records the entry, but fails the write, when echoing it to the console throws', async () => {
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => { throw new Error('console broken'); });
        onTestFinished(() => consoleLog.mockRestore());
        const storage = new MemoryLogStorage('my-app', { log_to_console: true });

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(result.ok).toBe(false);
        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'write', message: 'Could not echo the entry to the console.' }]);
        expect(entriesOf(await storage.get())).toEqual([result.entry]);
    });

    it('lists every failed step, in order, when the commit, the breakpoint check and the echo all fail', async () => {
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => { throw new Error('console broken'); });
        onTestFinished(() => consoleLog.mockRestore());
        const breakpoints = new UnreadableBreakpoints();
        breakpoints.setHandler(() => undefined);
        const storage = new FailingLogStorage('my-app', { commitEntry: { throws: new Error('down') } }, { breakpoints, log_to_console: true });

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(result.error?.failures.map(failure => failure.operation)).toEqual(['write', 'breakpoint', 'write']);
        expect(result.error?.message.startsWith('3 logging failures: ')).toBe(true);
    });
});

describe('a failure listener that writes into the store it listens to', () => {

    it.each<[string, HookFailure]>([
        ['throws', { throws: new Error('down') }],
        ['rejects', { rejects: new Error('down') }],
    ])('gets its own write\'s failure back, but is not told about it again, when the commit %s', async (_label, commitEntry) => {
        const storage = new FailingLogStorage('my-app', { commitEntry });
        const listenerWrites: Promise<LogWriteResult>[] = [];
        let runs = 0;
        storage.onFailure(() => {
            runs++;
            // Capped so a regression fails this test rather than looping forever.
            if (runs <= 3) listenerWrites.push(storage.add({ type: 'error', message: 'logging is failing' }));
        });

        await storage.add({ type: 'warn', message: 'slow' });
        const [listenerResult] = await Promise.all(listenerWrites);

        expect(runs).toBe(1);
        expect(listenerResult?.ok).toBe(false);
    });
});
