import { describe, it, expect, onTestFinished } from 'vitest';
import { MemoryLogStorage } from './memory/MemoryLogStorage.ts';
import { ConsoleLogStorage } from './console/ConsoleLogStorage.ts';
import { WebhookLogStorage } from './webhook/WebhookLogStorage.ts';
import type { ILogStorage } from './types.ts';
import { FailingLogStorage, type HookFailure } from './testing-helpers/FailingLogStorage.ts';
import { entryOf, recordFailures } from './testing-helpers/results.ts';
import { recordUnhandledRejections } from './testing-helpers/recordUnhandledRejections.ts';
import { createLoggingFailedResult } from '../failures/results.ts';
import type { LogReadResult, LoggingResult } from '../failures/types.ts';

// `never` answers: these only throw or reject, so they fit every hook.
const brokenHooks: [string, HookFailure<never>][] = [
    ['throws an Error', { throws: new Error('disk gone for secret-value') }],
    ['rejects with an Error', { rejects: new Error('disk gone for secret-value') }],
    ['throws a null-prototype object', { throws: Object.create(null) }],
];


describe('an app reading from a store', () => {

    it('gets every entry back, with ok true and no error', async () => {
        const storage = new MemoryLogStorage('my-app');
        const written = await storage.add({ type: 'info', message: 'fetched' });

        const result = await storage.get();

        expect(result.ok).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.entries).toEqual([written.entry]);
    });

    describe('when the store cannot read', () => {

        it.each(brokenHooks)('resolves a failed result with no entries when the read %s', async (_label, queryEntries) => {
            const unhandled = recordUnhandledRejections();
            onTestFinished(unhandled.stop);
            const storage = new FailingLogStorage('my-app', { queryEntries });
            await storage.add({ type: 'info', message: 'fetched' });

            const result = await storage.get();

            expect(result.ok).toBe(false);
            expect(result.entries).toEqual([]);
            expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'read', message: 'Could not read the entries.' }]);
            expect(JSON.stringify(result.error)).not.toContain('secret-value');
            expect(await unhandled.settled()).toEqual([]);
        });

        it.each(brokenHooks)('tells the store\'s failure listeners the same error once when the read %s', async (_label, queryEntries) => {
            const storage = new FailingLogStorage('my-app', { queryEntries });
            const failures = recordFailures(storage);

            const result = await storage.get();

            expect(failures.heard).toHaveLength(1);
            expect(failures.heard[0]).toBe(result.error);
        });
    });
});


describe('an app resetting or clearing old entries', () => {

    type AdminCall = [name: string, hook: 'resetEntries' | 'clearOldEntries', operation: string, message: string, call: (storage: MemoryLogStorage) => Promise<LoggingResult>];

    const adminCalls: AdminCall[] = [
        ['reset', 'resetEntries', 'reset', 'Could not reset the entries.', storage => storage.reset()],
        ['reset with entries', 'resetEntries', 'reset', 'Could not reset the entries.', storage => storage.reset([])],
        ['forceClearOldEntries', 'clearOldEntries', 'clear_old_entries', 'Could not clear old entries.', storage => storage.forceClearOldEntries()],
    ];

    it.each(adminCalls)('%s resolves ok on a healthy store, and tells the listeners nothing', async (_name, _hook, _operation, _message, call) => {
        const storage = new MemoryLogStorage('my-app');
        const failures = recordFailures(storage);

        const result = await call(storage);

        expect(result).toEqual({ ok: true });
        expect(failures.heard).toEqual([]);
    });

    describe.each(brokenHooks)('when the store\'s hook %s', (_label, failure) => {

        it.each(adminCalls)('%s resolves a failed result naming the operation, heard once by the listeners, and leaves nothing unhandled', async (_name, hook, operation, message, call) => {
            const unhandled = recordUnhandledRejections();
            onTestFinished(unhandled.stop);
            const storage = new FailingLogStorage('my-app', { [hook]: failure });
            const failures = recordFailures(storage);

            const result = await call(storage);

            expect(result.ok).toBe(false);
            expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation, message }]);
            expect(failures.heard).toHaveLength(1);
            expect(failures.heard[0]).toBe(result.error);
            expect(await unhandled.settled()).toEqual([]);
        });
    });

    it('reset leaves the store holding exactly the given entries, and a later write never changes the caller\'s array', async () => {
        const storage = new MemoryLogStorage('my-app');
        const given = [entryOf(await new MemoryLogStorage('other').add({ type: 'info', message: 'kept' }))];

        await storage.reset(given);
        await storage.add({ type: 'info', message: 'later' });

        expect(given.map(entry => entry.message)).toEqual(['kept']);
        expect((await storage.get()).entries.map(entry => entry.message)).toEqual(['kept', 'later']);
    });
});


describe('an app reading from a store that keeps no entries', () => {

    const keepsNothing: [string, () => ILogStorage][] = [
        ['the console', () => new ConsoleLogStorage()],
        ['a webhook', () => new WebhookLogStorage('my-app', 'https://example.invalid/hook')],
    ];

    it.each(keepsNothing)('%s reads ok with no entries, and resets and clears old entries ok', async (_name, build) => {
        const storage = build();
        const failures = recordFailures(storage);

        expect(await storage.get()).toEqual({ ok: true, entries: [] });
        expect(await storage.reset()).toEqual({ ok: true });
        expect(await storage.forceClearOldEntries()).toEqual({ ok: true });
        expect(failures.heard).toEqual([]);
    });
});


describe('an app that configures an unusable max age', () => {

    it('builds the store without anything left unhandled, and forceClearOldEntries says it failed', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        // @ts-expect-error -- a max age that is not an array (e.g. from untyped config) is what is under test
        const storage = new MemoryLogStorage('my-app', { max_age: { max_ms: 1000 } });

        const result = await storage.forceClearOldEntries();

        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'clear_old_entries', message: 'Could not clear old entries.' }]);
        expect(await unhandled.settled()).toEqual([]);
    });
});


describe('a store author whose hook answers for itself', () => {

    it('passes on, as the same object, a failed read the store described itself', async () => {
        const described = { ...createLoggingFailedResult({ source: 'IDBLogStorage:my-app', operation: 'read', message: 'The database is closed.', details: { name: 'InvalidStateError' } }), entries: [] };
        const storage = new FailingLogStorage('my-app', { queryEntries: { answers: described } });
        const failures = recordFailures(storage);

        const result = await storage.get();

        expect(result).toBe(described);
        expect(failures.heard[0]).toBe(described.error);
    });

    it('passes on, as the same object, a failed reset the store described itself', async () => {
        const described = createLoggingFailedResult({ source: 'IDBLogStorage:my-app', operation: 'reset', message: 'The database is closed.' });
        const storage = new FailingLogStorage('my-app', { resetEntries: { answers: described } });

        expect(await storage.reset()).toBe(described);
    });

    it.each<[string, unknown]>([
        ['a bare array of entries', []],
        ['nothing', undefined],
        ['ok without entries', { ok: true }],
        ['entries that are not log entries', { ok: true, entries: [null] }],
    ])('turns a read answered with %s into a read failure', async (_label, answer) => {
        const storage = new FailingLogStorage('my-app');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a malformed answer is what is under test
        storage.fail = { queryEntries: { answers: answer as any } };

        const result = await storage.get();

        expect(result.ok).toBe(false);
        expect(result.entries).toEqual([]);
        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'read', message: 'Could not read the entries.' }]);
    });
});


describe('a failure listener that reads from the store it listens to', () => {

    it.each(brokenHooks)('gets its own read\'s failure back, but is not told about it again, when the read %s', async (_label, queryEntries) => {
        const storage = new FailingLogStorage('my-app', { queryEntries });
        const listenerReads: Promise<LogReadResult>[] = [];
        let runs = 0;
        storage.onFailure(() => {
            runs++;
            // Capped so a regression fails this test rather than looping forever.
            if (runs <= 3) listenerReads.push(storage.get());
        });

        await storage.get();
        const [listenerResult] = await Promise.all(listenerReads);

        expect(runs).toBe(1);
        expect(listenerResult?.ok).toBe(false);
    });
});
