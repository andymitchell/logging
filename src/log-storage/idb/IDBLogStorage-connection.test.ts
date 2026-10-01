import "fake-indexeddb/auto"; // Prevent any long-term IDB storage
import { IDBFactory, forceCloseDatabase } from "fake-indexeddb";
import { describe, it, expect, beforeEach, onTestFinished } from 'vitest';
import { IDBLogStorage } from "./IDBLogStorage.ts";
import { idbRawAccess } from "./testing-helpers/idbRawAccess.ts";
import { recordUnhandledRejections } from "../testing-helpers/recordUnhandledRejections.ts";
import { entriesOf } from "../testing-helpers/results.ts";
import { currentEntry, unversionedEntry } from "../testing-helpers/storedRecords.ts";
import { createLoggingFailedResult } from "../../failures/results.ts";
import type { LogReadResult, LoggingFailure, LoggingOperation } from "../../failures/types.ts";


/** Every connection to a database opened during the test, in the order they opened. */
let connections: IDBDatabase[];

beforeEach(() => {
    // Reset fake idb data
    indexedDB = new IDBFactory();
    connections = [];
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
        const request = open(...args);
        request.addEventListener('success', () => { connections.push(request.result); });
        return request;
    };
});

const now = Date.UTC(2026, 0, 1);

/** The first connection opened in the test: the store's own, once it has answered a call. */
function storesConnection(): IDBDatabase {
    const [first] = connections;
    if( !first ) throw new Error('The store has not opened its database yet.');
    return first;
}

/**
 * Close `db` as a browser does when it takes a connection away (e.g. the user clears site data): once no
 * transaction on the database is running, the connection closes and a `close` event fires on it.
 */
function closeAsTheBrowserDoes(db: IDBDatabase): void {
    // fake-indexeddb types its parameter as its database class rather than a connection, though a connection is what it closes.
    forceCloseDatabase(db as never);
}

/** The message of each entry a read returned, in order. */
function messagesIn(result: LogReadResult) {
    return entriesOf(result).map(entry => entry.message);
}

/** What a write answers when the connection it is using has closed: the browser's reason. */
const writeOnAClosedConnection: LoggingFailure = {
    source: 'IDBLogStorage:my-app',
    operation: 'write',
    message: 'Could not record the entry.',
    details: { name: 'InvalidStateError' },
};


describe('an app whose IndexedDB connection the browser closes', () => {

    it('records a write made afterwards, and reads it back [dec-idb-reopens-a-closed-connection]', async () => {
        const storage = new IDBLogStorage('my-app');
        await storage.add({ type: 'info', message: 'before' });
        closeAsTheBrowserDoes(storesConnection());

        const written = await storage.add({ type: 'info', message: 'after' });

        expect(written.ok).toBe(true);
        expect(messagesIn(await storage.get())).toEqual(['before', 'after']);
    });

    it('upgrades entries written in an older format while it was closed, before answering the next call [dec-idb-reopens-a-closed-connection]', async () => {
        const storage = new IDBLogStorage('my-app');
        await storage.get();
        closeAsTheBrowserDoes(storesConnection());
        const raw = idbRawAccess('my-app');
        onTestFinished(raw.close);
        await raw.writeAll([unversionedEntry(1, now, { withTimestamp: false })]);

        const result = await storage.get();

        expect(entriesOf(result)).toEqual([currentEntry(1, now)]);
    });

    it('records writes made together afterwards, in the order they were made [dec-idb-reopens-a-closed-connection]', async () => {
        const storage = new IDBLogStorage('my-app');
        await storage.add({ type: 'info', message: 'before' });
        closeAsTheBrowserDoes(storesConnection());

        const written = await Promise.all(['one', 'two', 'three'].map(message => storage.add({ type: 'info', message })));

        expect(written.map(result => result.ok)).toEqual([true, true, true]);
        expect(messagesIn(await storage.get())).toEqual(['before', 'one', 'two', 'three']);
    });

    it('answers a write already under way when it closed with the browser\'s reason, and records the writes made after it, in order [dec-idb-reopens-a-closed-connection]', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new IDBLogStorage('my-app');
        await storage.get();

        const underWay = storage.add({ type: 'info', message: 'under way' });
        closeAsTheBrowserDoes(storesConnection());
        const after = [storage.add({ type: 'info', message: 'one' }), storage.add({ type: 'info', message: 'two' })];

        expect((await underWay).error?.failures).toEqual([writeOnAClosedConnection]);
        expect((await Promise.all(after)).map(result => result.ok)).toEqual([true, true]);
        expect(messagesIn(await storage.get())).toEqual(['one', 'two']);
        expect(await unhandled.settled()).toEqual([]);
    });
});


describe('an app whose IndexedDB connection closes without a close event', () => {

    it('answers the first write with the browser\'s reason, and records the next [dec-idb-reopens-a-closed-connection]', async () => {
        const storage = new IDBLogStorage('my-app');
        await storage.get();
        storesConnection().close();

        const refused = await storage.add({ type: 'info', message: 'refused' });
        const next = await storage.add({ type: 'info', message: 'next' });

        expect(refused.error?.failures).toEqual([writeOnAClosedConnection]);
        expect(next.ok).toBe(true);
        expect(messagesIn(await storage.get())).toEqual(['next']);
    });
});


describe('an app whose IndexedDB database another tab upgrades or deletes', () => {

    /**
     * Wait for another script's open or delete of the store's database to succeed. A `blocked` event fails it at
     * once: it means a connection would not close for it, and waiting would hang the test.
     */
    function succeedsUnblocked(request: IDBOpenDBRequest): Promise<void> {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Blocked: a connection to the database did not close.'));
        });
    }

    /** What every call answers once the database is at a newer version than the store's. */
    const openFailure = (operation: LoggingOperation): LoggingFailure => ({
        source: 'IDBLogStorage:my-app',
        operation,
        message: 'Could not open the IndexedDB database.',
        details: { name: 'VersionError' },
    });

    it('steps aside for an upgrade to a newer version, then answers every call with the open failure [dec-idb-reopens-a-closed-connection]', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new IDBLogStorage('my-app');
        await storage.add({ type: 'info', message: 'before' });

        const upgrade = indexedDB.open('my-app_logger', 2);
        await succeedsUnblocked(upgrade);
        onTestFinished(() => { upgrade.result.close(); });

        expect((await storage.add({ type: 'info', message: 'after' })).error?.failures).toEqual([openFailure('write')]);
        expect(await storage.get()).toEqual({ ...createLoggingFailedResult(openFailure('read')), entries: [] });
        expect(await storage.reset()).toEqual(createLoggingFailedResult(openFailure('reset')));
        expect(await storage.forceClearOldEntries()).toEqual(createLoggingFailedResult(openFailure('clear_old_entries')));
        expect(await unhandled.settled()).toEqual([]);
    });

    it('steps aside for a delete of the database, then records the next write in a new one [dec-idb-reopens-a-closed-connection]', async () => {
        const storage = new IDBLogStorage('my-app');
        await storage.add({ type: 'info', message: 'deleted' });

        await succeedsUnblocked(indexedDB.deleteDatabase('my-app_logger'));

        expect((await storage.add({ type: 'info', message: 'after' })).ok).toBe(true);
        expect(messagesIn(await storage.get())).toEqual(['after']);
    });
});
