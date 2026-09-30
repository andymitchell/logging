import "fake-indexeddb/auto"; // Prevent any long-term IDB storage
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach, onTestFinished, vi } from 'vitest';
import { IDBLogStorage } from "./IDBLogStorage.ts";
import { recordUnhandledRejections } from "../testing-helpers/recordUnhandledRejections.ts";
import { entriesOf, entryOf, recordFailures } from "../testing-helpers/results.ts";
import { MemoryLogStorage } from "../memory/MemoryLogStorage.ts";
import { ChannelsLogStorage } from "../channels/ChannelsLogStorage.ts";
import { Trace } from "../../trace/Trace.ts";
import { createLoggingFailedResult } from "../../failures/results.ts";
import type { LoggingFailure, LoggingOperation } from "../../failures/types.ts";
import type { LogStorageOptions } from "../types.ts";

beforeEach(() => {
    indexedDB = new IDBFactory();
});

/**
 * Open the database a store in `namespace` uses at `version`, then close it. Opening at a newer version than
 * the store's leaves the store's own open to fail with a `VersionError`. Opens of one database run in turn, so
 * once this resolves, every open requested before it has finished.
 */
async function openStoreDatabaseAt(namespace: string, version: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(`${namespace}_logger`, version);
        request.onsuccess = () => { request.result.close(); resolve(); };
        request.onerror = () => reject(request.error);
    });
}

describe('an app whose IndexedDB database cannot be opened', () => {

    it('leaves nothing unhandled when the app makes no call', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        await openStoreDatabaseAt('my-app', 2);

        new IDBLogStorage('my-app');
        await openStoreDatabaseAt('my-app', 2);

        expect(await unhandled.settled()).toEqual([]);
    });

    /** What every call answers: the store could not open its database, and the browser's reason why. */
    const openFailure = (operation: LoggingOperation): LoggingFailure => ({
        source: 'IDBLogStorage:my-app',
        operation,
        message: 'Could not open the IndexedDB database.',
        details: { name: 'VersionError' },
    });

    it('answers a write with the open failure, still returning the entry it built', async () => {
        await openStoreDatabaseAt('my-app', 2);
        const storage = new IDBLogStorage('my-app');

        const result = await storage.add({ type: 'info', message: 'hello' });

        expect(result.ok).toBe(false);
        expect(result.entry).toMatchObject({ type: 'info', message: 'hello' });
        expect(result.error?.failures).toEqual([openFailure('write')]);
    });

    it('answers a read with the open failure and no entries', async () => {
        await openStoreDatabaseAt('my-app', 2);
        const storage = new IDBLogStorage('my-app');

        const result = await storage.get();

        expect(result).toEqual({ ...createLoggingFailedResult(openFailure('read')), entries: [] });
    });

    it('answers a reset and a clear of old entries with the open failure', async () => {
        await openStoreDatabaseAt('my-app', 2);
        const storage = new IDBLogStorage('my-app');

        expect(await storage.reset()).toEqual(createLoggingFailedResult(openFailure('reset')));
        expect(await storage.forceClearOldEntries()).toEqual(createLoggingFailedResult(openFailure('clear_old_entries')));
    });

    it('tells the store\'s failure listeners about each failed call, once', async () => {
        await openStoreDatabaseAt('my-app', 2);
        const storage = new IDBLogStorage('my-app');
        const failures = recordFailures(storage);

        const results = [await storage.add({ type: 'info', message: 'hello' }), await storage.get(), await storage.reset(), await storage.forceClearOldEntries()];

        expect(failures.heard).toHaveLength(4);
        for (const [index, result] of results.entries()) expect(failures.heard[index]).toBe(result.error);
    });

    it('lets a trace run on it from start to end, answering each write with the failure and leaving nothing unhandled', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        await openStoreDatabaseAt('my-app', 2);
        const storage = new IDBLogStorage('my-app');
        const failures = recordFailures(storage);

        const trace = new Trace(storage);
        const results = [await trace.warn('slow'), await trace.end()];

        expect(results.map(result => result.error?.failures)).toEqual([[openFailure('write')], [openFailure('write')]]);
        expect(failures.heard.map(error => error.failures)).toEqual([[openFailure('write')], [openFailure('write')], [openFailure('write')]]);
        expect(await unhandled.settled()).toEqual([]);
    });

    it('leaves a Channels facade reading its healthy channel, and naming the store that failed', async () => {
        await openStoreDatabaseAt('my-app', 2);
        const facade = new ChannelsLogStorage('app', [{ storage: new IDBLogStorage('my-app') }, { storage: new MemoryLogStorage('memory') }]);
        const written = await facade.add({ type: 'info', message: 'hello' });

        const result = await facade.get();

        expect(result.entries.map(entry => entry.ulid)).toEqual([written.entry?.ulid]);
        expect(result.error?.failures).toEqual([openFailure('read')]);
    });
});


describe('an app whose entries IndexedDB refuses to store', () => {

    /** The database keys each entry by its `id`, so it refuses a second entry carrying an `id` it already holds. */
    const alreadyKeyed = { type: 'info' as const, message: 'first', id: 1 };

    const refusal = (operation: LoggingOperation, name: string): LoggingFailure => ({
        source: 'IDBLogStorage:my-app',
        operation,
        message: operation === 'write' ? 'Could not record the entry.' : 'Could not reset the entries.',
        details: { name },
    });

    it('answers a write the database refuses with a write failure naming the browser\'s reason, and keeps recording later writes', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new IDBLogStorage('my-app');
        await storage.add(alreadyKeyed);

        const refused = await storage.add(alreadyKeyed);
        const later = await storage.add({ type: 'info', message: 'later' });

        expect(refused.ok).toBe(false);
        expect(refused.error?.failures).toEqual([refusal('write', 'ConstraintError')]);
        expect(later.ok).toBe(true);
        expect(entriesOf(await storage.get()).map(entry => entry.message)).toEqual(['first', 'later']);
        expect(await unhandled.settled()).toEqual([]);
    });

    it('answers a write whose meta the browser cannot store with a write failure naming the browser\'s reason, and keeps recording later writes', async () => {
        const storage = new IDBLogStorage('my-app');

        const refused = await storage.add({ type: 'info', message: 'first', meta: { onDone: () => 1 } });
        const later = await storage.add({ type: 'info', message: 'later' });

        expect(refused.error?.failures).toEqual([refusal('write', 'DataCloneError')]);
        expect(later.ok).toBe(true);
        expect(entriesOf(await storage.get()).map(entry => entry.message)).toEqual(['later']);
    });

    it('answers a write whose meta throws a value that cannot be inspected with a plain write failure, telling its listeners and throwing nothing', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new IDBLogStorage('my-app');
        const failures = recordFailures(storage);
        const { proxy: revoked, revoke } = Proxy.revocable({}, {});
        revoke();

        const result = await storage.add({ type: 'info', message: 'first', meta: { get span() { throw revoked; } } });

        expect(result.error?.failures).toEqual([{ source: 'IDBLogStorage:my-app', operation: 'write', message: 'Could not record the entry.' }]);
        expect(failures.heard).toEqual([result.error]);
        expect(await unhandled.settled()).toEqual([]);
    });

    it('never repeats an exception name the browser did not choose', async () => {
        const storage = new IDBLogStorage('my-app');

        const result = await storage.add({ type: 'info', message: 'first', meta: { get span() { throw new DOMException('failure', 'alice@example.com'); } } });

        expect(result.error?.failures).toEqual([{ source: 'IDBLogStorage:my-app', operation: 'write', message: 'Could not record the entry.' }]);
        expect(JSON.stringify(result.error)).not.toContain('alice@example.com');
    });

    it('answers a reset the database refuses with a reset failure naming the browser\'s reason, leaving the entries as they were', async () => {
        const storage = new IDBLogStorage('my-app');
        await storage.add({ type: 'info', message: 'kept' });
        const replacement = entryOf(await new MemoryLogStorage('elsewhere').add(alreadyKeyed));

        const result = await storage.reset([replacement, replacement]);

        expect(result).toEqual(createLoggingFailedResult(refusal('reset', 'ConstraintError')));
        expect(entriesOf(await storage.get()).map(entry => entry.message)).toEqual(['kept']);
    });
});


describe('an app searching entries IndexedDB holds', () => {

    it('answers a full-text search that cannot turn an entry into JSON with a read failure, rather than never settling', async () => {
        const storage = new IDBLogStorage('my-app');
        await storage.add({ type: 'info', message: 'counted', meta: { count: 10n } });

        const result = await storage.get(undefined, 'counted');

        expect(result).toEqual({ ...createLoggingFailedResult({ source: 'IDBLogStorage:my-app', operation: 'read', message: 'Could not read the entries.' }), entries: [] });
        expect(entriesOf(await storage.get()).map(entry => entry.message)).toEqual(['counted']);
    });
});


describe('an app whose clean-up of old entries cannot run', () => {

    /** Options read from JSON with a `max_age` the clean-up cannot use. */
    const malformedMaxAges: [string, () => LogStorageOptions][] = [
        ['max_age is one rule rather than a list', () => JSON.parse('{ "max_age": { "max_ms": 60000 } }')],
        ['a max_age rule\'s filter cannot be matched against an entry', () => JSON.parse('{ "max_age": [{ "max_ms": 60000, "filter": { "type": { "$bogus": 1 } } }] }')],
    ];

    it.each(malformedMaxAges)('still records and reads entries when %s, leaving the clean-up it runs on opening unreported and nothing unhandled', async (_label, options) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        // Leaves an entry for the clean-up on opening to check.
        await new IDBLogStorage('my-app').add({ type: 'info', message: 'earlier' });
        const storage = new IDBLogStorage('my-app', options());
        const failures = recordFailures(storage);

        const written = await storage.add({ type: 'info', message: 'later' });

        expect(written.ok).toBe(true);
        expect(entriesOf(await storage.get()).map(entry => entry.message)).toEqual(['earlier', 'later']);
        expect(failures.heard).toEqual([]);
        expect(await unhandled.settled()).toEqual([]);
    });

    it.each(malformedMaxAges)('answers a clean-up the app asks for with a clean-up failure when %s, keeping the entries', async (_label, options) => {
        const storage = new IDBLogStorage('my-app', options());
        await storage.add({ type: 'info', message: 'kept' });

        const result = await storage.forceClearOldEntries();

        expect(result).toEqual(createLoggingFailedResult({ source: 'IDBLogStorage:my-app', operation: 'clear_old_entries', message: 'Could not clear old entries.' }));
        expect(entriesOf(await storage.get()).map(entry => entry.message)).toEqual(['kept']);
    });
});


describe('an app running where there is no IndexedDB', () => {

    it('answers every call with the open failure, leaving nothing unhandled', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        vi.stubGlobal('indexedDB', undefined);
        onTestFinished(() => { vi.unstubAllGlobals(); });
        const storage = new IDBLogStorage('my-app');

        const results = [await storage.add({ type: 'info', message: 'hello' }), await storage.get(), await storage.reset(), await storage.forceClearOldEntries()];

        expect(results.map(result => result.error?.failures)).toEqual((['write', 'read', 'reset', 'clear_old_entries'] as const).map(operation => [
            { source: 'IDBLogStorage:my-app', operation, message: 'Could not open the IndexedDB database.' },
        ]));
        expect(await unhandled.settled()).toEqual([]);
    });
});
