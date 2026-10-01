import "fake-indexeddb/auto"; // Prevent any long-term IDB storage
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach, onTestFinished } from 'vitest';
import { IDBLogStorage } from "./IDBLogStorage.ts";
import { idbRawAccess } from "./testing-helpers/idbRawAccess.ts";
import { MemoryLogStorage } from "../memory/MemoryLogStorage.ts";
import { entriesOf, entryOf } from "../testing-helpers/results.ts";


beforeEach(() => {
    // Reset fake idb data
    indexedDB = new IDBFactory();
});


describe('an app reading entries IndexedDB holds', () => {

    it('finds nothing searching for the key the database keeps beside each entry [dec-read-returns-entries-as-recorded]', async () => {
        const storage = new IDBLogStorage('my-app');
        await storage.add({ type: 'info', message: 'first' });

        const result = await storage.get(undefined, '"id"');

        expect(result.ok).toBe(true);
        expect(entriesOf(result)).toEqual([]);
    });

    it('records an entry it returned again when it is written back, to itself or to another store whose rows already use its key [dec-read-returns-entries-as-recorded]', async () => {
        const storage = new IDBLogStorage('my-app');
        const elsewhere = new IDBLogStorage('elsewhere');
        await storage.add({ type: 'info', message: 'first' });
        await elsewhere.add({ type: 'info', message: 'already there' });
        const read = entriesOf(await storage.get());
        expect(read.map(entry => entry.message)).toEqual(['first']);

        for( const entry of read ) {
            expect((await storage.add(entry)).ok).toBe(true);
            expect((await elsewhere.add(entry)).ok).toBe(true);
        }

        expect(entriesOf(await storage.get()).map(entry => entry.message)).toEqual(['first', 'first']);
        expect(entriesOf(await elsewhere.get()).map(entry => entry.message)).toEqual(['already there', 'first']);
    });
});


describe('an app writing entries that carry an id of their own', () => {

    /** What a caller might pass, from JavaScript or another log format. */
    const carryingAnId = { type: 'info' as const, message: 'carries an id', id: 7 };

    it('records the entry every time it is written, each under a key the database chooses [dec-read-returns-entries-as-recorded]', async () => {
        const storage = new IDBLogStorage('my-app');

        const written = [await storage.add(carryingAnId), await storage.add(carryingAnId)];

        expect(written.map(result => result.ok)).toEqual([true, true]);
        const raw = idbRawAccess('my-app');
        onTestFinished(raw.close);
        expect([...(await raw.readKeyed()).entries()]).toEqual([
            [1, expect.objectContaining({ message: 'carries an id', id: 1 })],
            [2, expect.objectContaining({ message: 'carries an id', id: 2 })],
        ]);
    });

    it('replaces what it holds with every entry a reset is given, even two carrying the same id [dec-read-returns-entries-as-recorded]', async () => {
        const storage = new IDBLogStorage('my-app');
        await storage.add({ type: 'info', message: 'replaced' });
        const elsewhere = new MemoryLogStorage('elsewhere');
        const given = [entryOf(await elsewhere.add({ ...carryingAnId, message: 'first' })), entryOf(await elsewhere.add({ ...carryingAnId, message: 'second' }))];
        expect(given).toEqual([expect.objectContaining({ id: 7 }), expect.objectContaining({ id: 7 })]);

        const result = await storage.reset(given);

        expect(result).toEqual({ ok: true });
        expect(entriesOf(await storage.get()).map(entry => entry.message)).toEqual(['first', 'second']);
    });
});
