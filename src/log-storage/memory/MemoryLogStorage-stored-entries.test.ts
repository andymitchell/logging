import { describe, it, expect, onTestFinished, vi } from 'vitest';
import { RawMemoryLogStorage } from './testing-helpers/RawMemoryLogStorage.ts';
import { entriesOf } from '../testing-helpers/results.ts';
import type { LogStorageOptions } from '../types.ts';
import { currentEntry, junkRecords, newerRecord, unversionedEntry } from '../testing-helpers/storedRecords.ts';


const now = Date.UTC(2026, 0, 1);

/** Stops the clock the store reads at `ms`, for the rest of the test. */
function clockAt(ms: number): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ms);
    onTestFinished(() => { vi.useRealTimers(); });
}


describe('a store whose substrate holds records it did not record', () => {

    describe('reading', () => {

        it('returns only the current entries, as a successful read', async () => {
            const storage = new RawMemoryLogStorage('my-app');
            storage.writeRaw([currentEntry(1, now), ...junkRecords(), unversionedEntry(2, now, { withTimestamp: true }), newerRecord(3, now), currentEntry(4, now)]);

            const result = await storage.get();

            expect(result).toEqual({ ok: true, entries: [currentEntry(1, now), currentEntry(4, now)] });
        });

        it('leaves every record on the substrate exactly as it was', async () => {
            const storage = new RawMemoryLogStorage('my-app');
            const written = [currentEntry(1, now), ...junkRecords(), unversionedEntry(2, now, { withTimestamp: false }), newerRecord(3, now)];
            storage.writeRaw(written);

            await storage.get();
            await storage.get({ type: 'info' }, 'entry');

            expect(storage.readRaw()).toEqual(written);
        });

        it('matches a filter only against current entries', async () => {
            const storage = new RawMemoryLogStorage('my-app');
            storage.writeRaw([currentEntry(1, now), unversionedEntry(2, now, { withTimestamp: true }), newerRecord(3, now)]);

            expect(entriesOf(await storage.get({ type: 'info' }))).toEqual([currentEntry(1, now)]);
            expect(entriesOf(await storage.get(undefined, 'entry'))).toEqual([currentEntry(1, now)]);
        });
    });

    describe('cleaning up', () => {

        it('upgrades an entry written before entries were versioned, keeping its ulid and taking its time from it', async () => {
            clockAt(now);
            const storage = new RawMemoryLogStorage('my-app', { max_age: [{ max_ms: 60_000 }] });
            storage.writeRaw([unversionedEntry(1, now, { withTimestamp: false }), unversionedEntry(2, now - 5, { withTimestamp: true })]);

            expect(await storage.forceClearOldEntries()).toEqual({ ok: true });

            expect(entriesOf(await storage.get())).toEqual([currentEntry(1, now), currentEntry(2, now - 5)]);
        });

        it('removes every record it cannot read, and keeps the current entries', async () => {
            clockAt(now);
            const storage = new RawMemoryLogStorage('my-app', { max_age: [{ max_ms: 60_000 }] });
            storage.writeRaw([currentEntry(1, now), ...junkRecords(), unversionedEntry(2, now, { withTimestamp: false })]);

            await storage.forceClearOldEntries();

            expect(storage.readRaw()).toEqual([currentEntry(1, now), currentEntry(2, now)]);
        });

        it('keeps a record from a newer library untouched, however old it is', async () => {
            clockAt(now);
            const storage = new RawMemoryLogStorage('my-app', { max_age: [{ max_ms: 60_000 }] });
            const anHourOld = newerRecord(1, now - 3_600_000);
            storage.writeRaw([anHourOld]);

            await storage.forceClearOldEntries();

            expect(storage.readRaw()).toEqual([anHourOld]);
            expect(entriesOf(await storage.get())).toEqual([]);
        });

        it('removes entries older than their max age, whatever format they were written in', async () => {
            clockAt(now);
            const storage = new RawMemoryLogStorage('my-app', { max_age: [{ max_ms: 60_000 }] });
            const anHourAgo = now - 3_600_000;
            storage.writeRaw([
                currentEntry(1, anHourAgo), unversionedEntry(2, anHourAgo, { withTimestamp: true }), unversionedEntry(3, anHourAgo, { withTimestamp: false }),
                currentEntry(4, now), unversionedEntry(5, now, { withTimestamp: true }), unversionedEntry(6, now, { withTimestamp: false }),
            ]);

            await storage.forceClearOldEntries();

            expect(storage.readRaw()).toEqual([currentEntry(4, now), currentEntry(5, now), currentEntry(6, now)]);
        });

        it('leaves the substrate a second clean-up finds exactly as the first left it', async () => {
            clockAt(now);
            const storage = new RawMemoryLogStorage('my-app', { max_age: [{ max_ms: 60_000 }] });
            storage.writeRaw([currentEntry(1, now), ...junkRecords(), unversionedEntry(2, now, { withTimestamp: false }), newerRecord(3, now - 3_600_000), currentEntry(4, now - 3_600_000)]);

            await storage.forceClearOldEntries();
            const afterFirst = storage.readRaw();
            await storage.forceClearOldEntries();

            expect(storage.readRaw()).toEqual(afterFirst);
        });

        it.each<[string, () => LogStorageOptions]>([
            ['max_age is one rule rather than a list', () => JSON.parse('{ "max_age": { "max_ms": 60000 } }')],
            ['a max_age rule\'s filter cannot be matched against an entry', () => JSON.parse('{ "max_age": [{ "max_ms": 60000, "filter": { "type": { "$bogus": 1 } } }] }')],
        ])('changes nothing, not even the records it cannot read, when %s', async (_label, options) => {
            const storage = new RawMemoryLogStorage('my-app', options());
            const written = [currentEntry(1, now), ...junkRecords(), unversionedEntry(2, now, { withTimestamp: false })];
            storage.writeRaw(written);

            const result = await storage.forceClearOldEntries();

            expect(result.error?.failures.map(failure => failure.operation)).toEqual(['clear_old_entries']);
            expect(storage.readRaw()).toEqual(written);
        });
    });
});
