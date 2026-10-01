import { expect } from 'vitest';
import type { ConformanceClaim } from "../types.ts";
import type { LogEntry } from "../../../log-storage/types.ts";
import type { LogReadResult } from "../../../failures/types.ts";
import { LogEntrySchema } from "../../../log-storage/schemas.ts";
import { LOG_ENTRY_FORMAT_VERSION } from "../../../log-storage/format/index.ts";
import { entryOf, recordFailures } from "../../../log-storage/testing-helpers/results.ts";
import { AN_HOUR, KEPT_FOR_A_MINUTE } from "../../helpers/clock.ts";
import { asEntries, currentEntry, junkRecords, malformedAcceptEntries, newerRecord, unversionedEntry } from "../../helpers/fixtures.ts";
import { readyInstance } from "../../helpers/ready-instance.ts";
import { keepsEntries, survivingUpgrades, ulidsOf } from "../../helpers/records.ts";


// A store never returns anything but a current, valid entry it accepted or upgraded, whatever it is handed and whatever is put underneath it.
export const onlyCurrentEntriesEverComeOut: ConformanceClaim = {
    name: 'returns only current, valid entries it accepted or upgraded, through any mix of good and bad writes, records left underneath it, and clean-up [dec-store-only-holds-current-entries]',
    options: KEPT_FOR_A_MINUTE,
    async check(harness) {
        const now = Date.now();
        const store = await readyInstance(harness);
        const failures = recordFailures(store);
        const accepted: LogEntry[] = [];
        let refused = 0;

        for( const context of [5, 'text', { a: 1 }] ) {
            accepted.push(entryOf(await store.add({ type: 'info', message: `valid ${accepted.length}`, context })));
        }
        for( const [label, entry] of malformedAcceptEntries() ) {
            expect((await store.add(entry)).ok, label).toBe(false);
            refused++;
        }
        expect((await store.reset(asEntries([currentEntry(1), ...junkRecords()]))).ok).toBe(false);
        refused++;

        // Left underneath it: an aged current entry is still current, so reads may return it until clean-up removes it.
        const agedButCurrent = currentEntry(5, now - AN_HOUR);
        const upgraded: LogEntry[] = [];
        if( harness.raw ) {
            await harness.raw.writeAll([...junkRecords(), unversionedEntry(2, now - AN_HOUR, { withTimestamp: true }), unversionedEntry(3, now, { withTimestamp: false }), newerRecord(4), agedButCurrent]);
            upgraded.push(...survivingUpgrades(harness, [currentEntry(3, now)]));
        }

        expectOnlyCurrentEntries(await store.get(), [...accepted, ...upgraded, agedButCurrent]);
        expect(await store.forceClearOldEntries()).toEqual({ ok: true });
        expectOnlyCurrentEntries(await store.get(), [...accepted, ...upgraded]);
        for( const message of ['valid later 1', 'valid later 2'] ) accepted.push(entryOf(await store.add({ type: 'info', message })));
        const final = expectOnlyCurrentEntries(await store.get(), [...accepted, ...upgraded]);

        expect([...ulidsOf(final)].sort()).toEqual(keepsEntries(harness) ? ulidsOf([...accepted, ...upgraded]).sort() : []);
        expect(failures.heard).toHaveLength(refused);
    },
};


/**
 * Check a read succeeded and returned only current, valid entries from `permitted`.
 *
 * @returns The entries the read returned.
 */
function expectOnlyCurrentEntries(read: LogReadResult, permitted: readonly LogEntry[]): LogEntry[] {
    expect(read.ok).toBe(true);
    expect(read.error).toBeUndefined();
    for( const entry of read.entries ) {
        expect(LogEntrySchema.safeParse(entry).success).toBe(true);
        expect(entry.format_version).toBe(LOG_ENTRY_FORMAT_VERSION);
    }
    expect(ulidsOf(permitted)).toEqual(expect.arrayContaining(ulidsOf(read.entries)));
    return read.entries;
}
