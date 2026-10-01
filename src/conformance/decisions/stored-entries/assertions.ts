import { expect } from 'vitest';
import type { ConformanceClaim } from "../types.ts";
import type { ImplLogStorageHarness } from "../../harness-types.ts";
import type { LogEntry } from "../../../log-storage/types.ts";
import { LOG_ENTRY_FORMAT_VERSION } from "../../../log-storage/format/index.ts";
import { entriesOf, entryOf } from "../../../log-storage/testing-helpers/results.ts";
import { AN_HOUR, KEPT_FOR_A_MINUTE } from "../../helpers/clock.ts";
import { currentEntry, junkRecords, newerRecord, unmigratableEntry, unversionedEntry } from "../../helpers/fixtures.ts";
import { unlessMigrating, unlessObservable, unlessShared } from "../../helpers/gates.ts";
import { readyInstance } from "../../helpers/ready-instance.ts";
import { expectSubstrateHolds, identities, identitiesByUlid, rawOf, survivingUpgrades, ulidsOf } from "../../helpers/records.ts";
import { unversionedTrace, unversionedTraceId } from "../../helpers/unversioned-trace.ts";
// Read through the entry apps use to view traces, as an app would.
import { TraceViewer } from "../../../index-get-traces.ts";


// A read returns the current entries on the substrate, however they got there.
export const readsCurrentEntriesWrittenUnderneath: ConformanceClaim = {
    name: 'returns current entries found on its substrate, however they got there [dec-read-skips-non-current-records]',
    skipReason: unlessObservable,
    async check(harness) {
        const store = await readyInstance(harness);
        const written = [currentEntry(1), currentEntry(2)];

        await rawOf(harness).writeAll(written);

        expect(identities(entriesOf(await store.get()))).toEqual(identities(written));
    },
};

// A read skips records that are not entries, and is still a successful read.
export const readSkipsJunk: ConformanceClaim = {
    name: 'skips records that are not entries, answering a successful read of the entries around them [dec-read-skips-non-current-records]',
    skipReason: unlessObservable,
    async check(harness) {
        const store = await readyInstance(harness);
        await rawOf(harness).writeAll([currentEntry(1), ...junkRecords(), currentEntry(2)]);

        const read = await store.get();

        expect(read.ok).toBe(true);
        expect(read.error).toBeUndefined();
        expect(ulidsOf(read.entries)).toEqual([currentEntry(1).ulid, currentEntry(2).ulid]);
    },
};

// A read skips entries from before entries were versioned until clean-up upgrades them.
export const readSkipsUnversionedEntries: ConformanceClaim = {
    name: 'skips entries from before entries were versioned that appear after it started, until a clean-up upgrades them [dec-read-skips-non-current-records]',
    skipReason: unlessObservable,
    async check(harness) {
        const store = await readyInstance(harness);
        const now = Date.now();
        await rawOf(harness).writeAll([unversionedEntry(1, now, { withTimestamp: true }), unversionedEntry(2, now, { withTimestamp: false }), currentEntry(3)]);

        expect(ulidsOf(entriesOf(await store.get()))).toEqual([currentEntry(3).ulid]);
    },
};

// A record a newer library wrote is never returned, and neither a read nor a clean-up changes it, however old it is.
export const newerRecordsAreLeftAlone: ConformanceClaim = {
    name: 'never returns a record a newer library wrote, and leaves it exactly as written through reads and clean-up, however old [dec-newer-format-left-alone]',
    options: KEPT_FOR_A_MINUTE,
    skipReason: unlessObservable,
    async check(harness) {
        const raw = rawOf(harness);
        const store = await readyInstance(harness);
        const newer = newerRecord(1, Date.now() - AN_HOUR);
        await raw.writeAll([newer]);

        expect(entriesOf(await store.get())).toEqual([]);
        expect(await raw.readAll()).toEqual([newer]);

        expect(await store.forceClearOldEntries()).toEqual({ ok: true });

        expect(entriesOf(await store.get())).toEqual([]);
        expect(await raw.readAll()).toEqual([newer]);
    },
};

// A read never deletes or rewrites anything on the substrate.
export const readsNeverChangeTheSubstrate: ConformanceClaim = {
    name: 'leaves every record on its substrate exactly as it was when it reads, filters or searches [dec-read-skips-non-current-records]',
    skipReason: unlessObservable,
    async check(harness) {
        const raw = rawOf(harness);
        const store = await readyInstance(harness);
        const written = [currentEntry(1), ...junkRecords(), unversionedEntry(2, Date.now(), { withTimestamp: false }), newerRecord(3), currentEntry(4)];
        await raw.writeAll(written);

        await store.get();
        await store.get({ type: 'info' });
        await store.get(undefined, 'entry');

        await expectSubstrateHolds(raw, written);
    },
};

// Clean-up removes records that are not entries and entries past their max age, and keeps the rest.
export const cleanUpRemovesJunkAndAgedEntries: ConformanceClaim = {
    name: 'removes records that are not entries and entries older than their max age when cleaning up, keeping the rest [dec-clean-up-migrates-or-purges]',
    options: KEPT_FOR_A_MINUTE,
    skipReason: unlessObservable,
    async check(harness) {
        const raw = rawOf(harness);
        const store = await readyInstance(harness);
        const fresh = currentEntry(2);
        await raw.writeAll([...junkRecords(), currentEntry(1, Date.now() - AN_HOUR), fresh]);

        expect(await store.forceClearOldEntries()).toEqual({ ok: true });

        await expectSubstrateHolds(raw, [fresh]);
        expect(identities(entriesOf(await store.get()))).toEqual(identities([fresh]));
    },
};

// Clean-up upgrades entries from before entries were versioned, keeping their ulid and recovering a missing time from it.
export const cleanUpUpgradesUnversionedEntries: ConformanceClaim = {
    name: 'upgrades entries from before entries were versioned when cleaning up, keeping each ulid and taking a missing time from it [dec-migration-is-one-pure-map]',
    skipReason: harness => unlessObservable(harness) ?? unlessMigrating(harness),
    async check(harness) {
        const raw = rawOf(harness);
        const store = await readyInstance(harness);
        const now = Date.now();
        await raw.writeAll([unversionedEntry(1, now - 5, { withTimestamp: true }), unversionedEntry(2, now, { withTimestamp: false })]);

        expect(await store.forceClearOldEntries()).toEqual({ ok: true });

        const upgraded = [currentEntry(1, now - 5), currentEntry(2, now)];
        expect(identities(entriesOf(await store.get()))).toEqual(identities(upgraded));
        await expectSubstrateHolds(raw, upgraded);
    },
};

// An entry from before entries were versioned ages out exactly as a current entry of the same age does.
export const unversionedEntriesAgeLikeCurrentOnes: ConformanceClaim = {
    name: 'removes an aged entry from before entries were versioned exactly when it removes a current entry of the same age [dec-unversioned-is-v1]',
    options: KEPT_FOR_A_MINUTE,
    skipReason: unlessObservable,
    async check(harness) {
        const raw = rawOf(harness);
        const store = await readyInstance(harness);
        const now = Date.now();
        const anHourAgo = now - AN_HOUR;
        await raw.writeAll([
            unversionedEntry(1, anHourAgo, { withTimestamp: true }), unversionedEntry(2, anHourAgo, { withTimestamp: false }), currentEntry(3, anHourAgo),
            unversionedEntry(4, now, { withTimestamp: true }), unversionedEntry(5, now, { withTimestamp: false }), currentEntry(6, now),
        ]);

        expect(await store.forceClearOldEntries()).toEqual({ ok: true });

        await expectSubstrateHolds(raw, [...survivingUpgrades(harness, [currentEntry(4, now), currentEntry(5, now)]), currentEntry(6, now)]);
    },
};

// An entry from before entries were versioned whose time cannot be recovered is never returned, and clean-up removes it.
export const cleanUpRemovesUnmigratableEntries: ConformanceClaim = {
    name: 'never returns an entry from before entries were versioned whose time cannot be recovered, and removes it when cleaning up [dec-clean-up-migrates-or-purges]',
    skipReason: unlessObservable,
    async check(harness) {
        const raw = rawOf(harness);
        const store = await readyInstance(harness);
        const kept = currentEntry(2);
        await raw.writeAll([unmigratableEntry(1), kept]);

        expect(ulidsOf(entriesOf(await store.get()))).toEqual([kept.ulid]);
        expect(await store.forceClearOldEntries()).toEqual({ ok: true });

        await expectSubstrateHolds(raw, [kept]);
        expect(ulidsOf(entriesOf(await store.get()))).toEqual([kept.ulid]);
    },
};

// A trace recorded before entries were versioned reads back, once clean-up has upgraded it, as the same trace: every field of every entry kept.
export const oldTraceReadsBackAfterUpgrade: ConformanceClaim = {
    name: 'reads back a trace recorded before entries were versioned as the same trace, once it has cleaned up [dec-unversioned-is-v1]',
    skipReason: harness => unlessObservable(harness) ?? unlessMigrating(harness),
    async check(harness) {
        const store = await readyInstance(harness);
        await rawOf(harness).writeAll(unversionedTrace);

        expect(await store.forceClearOldEntries()).toEqual({ ok: true });

        const read = await new TraceViewer(store).getTraces();
        expect(read.ok).toBe(true);
        expect(read.traces.map(trace => trace.id)).toEqual([unversionedTraceId]);
        expect(read.traces[0]?.logs).toEqual(unversionedTrace.map(record => expect.objectContaining({ ...record, format_version: LOG_ENTRY_FORMAT_VERSION })));
    },
};

// A store over a substrate that outlives it cleans up as it opens, and answers a read made at once only from the cleaned substrate.
export const startUpCleanUpPrecedesTheFirstRead: ConformanceClaim = {
    name: 'cleans up what an earlier store left before answering a read made as soon as it is constructed [dec-clean-up-migrates-or-purges] [dec-start-up-clean-up-before-first-answer]',
    options: KEPT_FOR_A_MINUTE,
    skipReason: harness => unlessObservable(harness) ?? unlessOutlivesInstances(harness),
    async check(harness) {
        const raw = rawOf(harness);
        const upgraded = await leaveOldRecordsBehind(harness);

        const store = await harness.instance();
        const read = await store.get();

        expect(identities(entriesOf(read))).toEqual(identities(upgraded));
        await expectSubstrateHolds(raw, upgraded);
    },
};

// Calls made before start-up clean-up is done are held, in call order, and answered from the cleaned substrate: never dropped or refused.
export const callsMadeDuringStartUpAreHeld: ConformanceClaim = {
    name: 'holds a write and a read made as soon as it is constructed until it has cleaned up, then answers both in call order [dec-start-up-clean-up-before-first-answer]',
    options: KEPT_FOR_A_MINUTE,
    skipReason: harness => unlessObservable(harness) ?? unlessOutlivesInstances(harness),
    async check(harness) {
        const raw = rawOf(harness);
        const upgraded = await leaveOldRecordsBehind(harness);

        const store = await harness.instance();
        const write = store.add({ type: 'info', message: 'first' });
        const read = store.get();
        const [written, result] = await Promise.all([write, read]);

        const first = entryOf(written);
        expect(identitiesByUlid(entriesOf(result))).toEqual(identitiesByUlid([...upgraded, first]));
        await expectSubstrateHolds(raw, [...upgraded, expect.objectContaining({ ulid: first.ulid, message: 'first', format_version: LOG_ENTRY_FORMAT_VERSION })]);
    },
};

// A second clean-up, by the same store or a sibling, leaves the substrate exactly as the first did.
export const cleanUpIsIdempotent: ConformanceClaim = {
    name: 'leaves its substrate exactly as the first clean-up did when it cleans up again [dec-clean-up-is-idempotent]',
    options: KEPT_FOR_A_MINUTE,
    skipReason: unlessObservable,
    async check(harness) {
        const raw = rawOf(harness);
        const store = await readyInstance(harness);
        const now = Date.now();
        const written = [unversionedEntry(1, now, { withTimestamp: false }), ...junkRecords(), currentEntry(2, now - AN_HOUR), newerRecord(3, now - AN_HOUR), currentEntry(4, now)];
        await raw.writeAll(written);

        expect(await store.forceClearOldEntries()).toEqual({ ok: true });
        const afterFirst = await raw.readAll();
        // What the first clean-up should leave is other rules' business; this one needs only that it did something.
        expect(afterFirst.length).toBeLessThan(written.length);
        const readAfterFirst = identities(entriesOf(await store.get()));

        const again = harness.capabilities.substrate.mode === 'shared' ? await readyInstance(harness) : store;
        expect(await again.forceClearOldEntries()).toEqual({ ok: true });

        await expectSubstrateHolds(raw, afterFirst);
        expect(identities(entriesOf(await again.get()))).toEqual(readAfterFirst);
    },
};

// A store that declares it discards old entries leaves none of them on its substrate after clean-up.
export const discardingStoresLeaveNoOldEntries: ConformanceClaim = {
    name: 'removes every entry from before entries were versioned when cleaning up, if it declares it discards them [dec-store-may-discard-instead-of-migrate]',
    skipReason: harness => unlessObservable(harness) ?? (harness.capabilities.migration.mode === 'migrates' ? 'Declared to migrate: the migration rules bind it instead.' : undefined),
    async check(harness) {
        const raw = rawOf(harness);
        const store = await readyInstance(harness);
        const now = Date.now();
        await raw.writeAll([unversionedEntry(1, now, { withTimestamp: true }), unversionedEntry(2, now, { withTimestamp: false }), currentEntry(3, now)]);

        expect(await store.forceClearOldEntries()).toEqual({ ok: true });

        await expectSubstrateHolds(raw, [currentEntry(3, now)]);
        expect(ulidsOf(entriesOf(await store.get()))).toEqual([currentEntry(3, now).ulid]);
    },
};


/** Why a claim about cleaning up at construction does not bind this store. `undefined` when it binds. */
function unlessOutlivesInstances(harness: ImplLogStorageHarness): string | undefined {
    return unlessShared(harness) === undefined ? undefined : 'Construction clean-up binds substrates that outlive a store; a private substrate holds nothing before its store exists.';
}

/**
 * Leave on the substrate what an earlier library and other scripts might have: entries from before entries
 * were versioned, junk, and an aged entry. Written once the substrate is ready, so no store's clean-up has
 * seen them yet.
 *
 * @returns What clean-up should leave: the upgraded entries, or none for a store that discards them.
 */
async function leaveOldRecordsBehind(harness: ImplLogStorageHarness): Promise<LogEntry[]> {
    await readyInstance(harness);
    const now = Date.now();
    await rawOf(harness).writeAll([unversionedEntry(1, now, { withTimestamp: true }), unversionedEntry(2, now, { withTimestamp: false }), ...junkRecords(), currentEntry(3, now - AN_HOUR)]);
    return survivingUpgrades(harness, [currentEntry(1, now), currentEntry(2, now)]);
}
