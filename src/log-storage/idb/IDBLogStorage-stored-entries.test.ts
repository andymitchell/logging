import "fake-indexeddb/auto"; // Prevent any long-term IDB storage
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach, onTestFinished, vi } from 'vitest';
import type { LogEntry, LogStorageOptions } from '../types.ts';
import { IDBLogStorage } from './IDBLogStorage.ts';
import { idbRawAccess } from './testing-helpers/idbRawAccess.ts';
import { entriesOf } from '../testing-helpers/results.ts';
import { currentEntry, junkRecords, newerRecord, unversionedEntry } from '../testing-helpers/storedRecords.ts';


beforeEach(() => {
    // Reset fake idb data
    indexedDB = new IDBFactory();
});

const now = Date.UTC(2026, 0, 1);

/** Stops the clock the store reads at `ms`, for the rest of the test. Timers keep running, so IndexedDB works as usual. */
function clockAt(ms: number): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ms);
    onTestFinished(() => { vi.useRealTimers(); });
}

/** An entry as `get` returns it, without the row key IndexedDB adds. */
function withoutRowKey({ id: _id, ...entry }: LogEntry & { id?: unknown }): LogEntry {
    return entry;
}

/** A store over a database that exists, and a raw connection to that database. */
async function openedDatabase(dbNamespace = 'my-app') {
    const storage = new IDBLogStorage(dbNamespace);
    await storage.get();
    const raw = idbRawAccess(dbNamespace);
    onTestFinished(raw.close);
    return { storage, raw };
}


describe('a database holding records the store did not record', () => {

    describe('reading', () => {

        it('returns only the current entries, as a successful read, leaving every row as it was', async () => {
            const { storage, raw } = await openedDatabase();
            const written = [currentEntry(1, now), ...junkRecords(), unversionedEntry(2, now, { withTimestamp: true }), newerRecord(3, now), currentEntry(4, now)];
            await raw.writeAll(written);

            const result = await storage.get();

            expect(result.ok).toBe(true);
            expect(result.error).toBeUndefined();
            expect(entriesOf(result).map(entry => entry.ulid)).toEqual([currentEntry(1, now).ulid, currentEntry(4, now).ulid]);
            expect(await raw.readAll()).toEqual(written);
        });
    });

    describe('opening a store over it', () => {

        it('upgrades entries written before entries were versioned in their own rows, before answering a read issued straight away', async () => {
            clockAt(now);
            const { raw } = await openedDatabase();
            const [withTimestamp, withoutTimestamp] = await raw.writeAll([unversionedEntry(1, now - 5, { withTimestamp: true }), unversionedEntry(2, now, { withTimestamp: false })]);

            const storage = new IDBLogStorage('my-app', { max_age: [{ max_ms: 60_000 }] });
            const result = await storage.get();

            expect(entriesOf(result).map(withoutRowKey)).toEqual([currentEntry(1, now - 5), currentEntry(2, now)]);
            expect(await raw.readKeyed()).toEqual(new Map([[withTimestamp, { ...currentEntry(1, now - 5), id: withTimestamp }], [withoutTimestamp, { ...currentEntry(2, now), id: withoutTimestamp }]]));
        });

        it('removes rows it cannot read and entries older than their max age, whatever their format, and keeps a newer library\'s rows untouched', async () => {
            clockAt(now);
            const { raw } = await openedDatabase();
            const anHourAgo = now - 3_600_000;
            const newer = newerRecord(9, anHourAgo);
            await raw.writeAll([
                ...junkRecords(), newer,
                currentEntry(1, anHourAgo), unversionedEntry(2, anHourAgo, { withTimestamp: true }), unversionedEntry(3, anHourAgo, { withTimestamp: false }),
                currentEntry(4, now),
            ]);

            const storage = new IDBLogStorage('my-app', { max_age: [{ max_ms: 60_000 }] });
            const result = await storage.get();

            expect(entriesOf(result).map(withoutRowKey)).toEqual([currentEntry(4, now)]);
            expect(await raw.readAll()).toEqual([newer, currentEntry(4, now)]);
        });

        it('records an add issued straight after construction, once, after the clean-up', async () => {
            const { raw } = await openedDatabase();
            await raw.writeAll([...junkRecords(), unversionedEntry(1, now, { withTimestamp: true })]);

            const storage = new IDBLogStorage('my-app');
            const write = storage.add({ type: 'info', message: 'first' });
            const read = storage.get();
            const [written, result] = await Promise.all([write, read]);

            expect(written.ok).toBe(true);
            expect(entriesOf(result).map(entry => entry.message)).toEqual(['entry 1', 'first']);
            expect(await raw.readAll()).toEqual([currentEntry(1, now), written.entry]);
        });
    });

    describe('opening several stores over it at once', () => {

        it('leaves each upgraded entry once, in its own row, and every store reads the same entries [dec-idb-clean-up-relies-on-transaction-serialisation]', async () => {
            const { raw } = await openedDatabase();
            const newer = newerRecord(9, now);
            const keys = await raw.writeAll([
                unversionedEntry(1, now, { withTimestamp: true }), unversionedEntry(2, now, { withTimestamp: false }), unversionedEntry(3, now, { withTimestamp: true }),
                ...junkRecords(), newer,
            ]);

            const stores = [new IDBLogStorage('my-app'), new IDBLogStorage('my-app'), new IDBLogStorage('my-app')];
            const reads = await Promise.all(stores.map(store => store.get()));

            const upgraded = [currentEntry(1, now), currentEntry(2, now), currentEntry(3, now)];
            for( const read of reads ) expect(entriesOf(read).map(withoutRowKey)).toEqual(upgraded);
            expect([...(await raw.readKeyed()).entries()]).toEqual([
                ...upgraded.map((entry, index) => [keys[index], { ...entry, id: keys[index] }]),
                [keys.at(-1), { ...newer, id: keys.at(-1) }],
            ]);
        });

        it('shows an entry one store adds to a read on another', async () => {
            await openedDatabase();
            const [writer, , reader] = [new IDBLogStorage('my-app'), new IDBLogStorage('my-app'), new IDBLogStorage('my-app')];

            const written = await writer.add({ type: 'info', message: 'from another tab' });

            expect(entriesOf(await reader.get()).map(entry => entry.ulid)).toEqual([written.entry?.ulid]);
        });
    });

    describe('cleaning up on request', () => {

        it('upgrades, removes and keeps rows written after the store opened, exactly as opening does', async () => {
            clockAt(now);
            const storage = new IDBLogStorage('my-app', { max_age: [{ max_ms: 60_000 }] });
            await storage.get();
            const raw = idbRawAccess('my-app');
            onTestFinished(raw.close);
            const newer = newerRecord(9, now - 3_600_000);
            await raw.writeAll([...junkRecords(), newer, currentEntry(1, now - 3_600_000), unversionedEntry(2, now, { withTimestamp: false }), currentEntry(3, now)]);

            expect(await storage.forceClearOldEntries()).toEqual({ ok: true });

            expect(await raw.readAll()).toEqual([newer, currentEntry(2, now), currentEntry(3, now)]);
        });

        it.each<[string, () => LogStorageOptions]>([
            ['max_age is one rule rather than a list', () => JSON.parse('{ "max_age": { "max_ms": 60000 } }')],
            ['a max_age rule\'s filter cannot be matched against an entry', () => JSON.parse('{ "max_age": [{ "max_ms": 60000, "filter": { "type": { "$bogus": 1 } } }] }')],
        ])('changes no row, not even one it cannot read, when %s', async (_label, options) => {
            const storage = new IDBLogStorage('my-app', options());
            await storage.get();
            const raw = idbRawAccess('my-app');
            onTestFinished(raw.close);
            const written = [...junkRecords(), unversionedEntry(1, now, { withTimestamp: false }), currentEntry(2, now)];
            await raw.writeAll(written);

            const result = await storage.forceClearOldEntries();

            expect(result.error?.failures.map(failure => failure.operation)).toEqual(['clear_old_entries']);
            expect(await raw.readAll()).toEqual(written);
        });
    });
});
