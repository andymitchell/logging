import { expect } from 'vitest';
import type { ConformanceClaim } from "../types.ts";
import { entriesOf, entryOf } from "../../../log-storage/testing-helpers/results.ts";
import { AN_HOUR, KEPT_FOR_A_MINUTE } from "../../helpers/clock.ts";
import { currentEntry, junkRecords, newerRecord, unversionedEntry } from "../../helpers/fixtures.ts";
import { unlessObservable, unlessShared } from "../../helpers/gates.ts";
import { readyInstance } from "../../helpers/ready-instance.ts";
import { expectSubstrateHolds, identities, identitiesByUlid, rawOf, survivingUpgrades, ulidsOf } from "../../helpers/records.ts";


// An add, reset or clean-up that has resolved on one instance is reflected by the next read on any sibling.
export const siblingsSeeEachOthersWrites: ConformanceClaim = {
    name: 'shows a sibling every add, reset and clean-up as soon as it has resolved [dec-shared-write-visibility]',
    options: KEPT_FOR_A_MINUTE,
    skipReason: unlessShared,
    async check(harness) {
        const [app, viewer] = await Promise.all([readyInstance(harness), readyInstance(harness)]);

        const added = entryOf(await app.add({ type: 'info', message: 'from the app' }));
        expect(ulidsOf(entriesOf(await viewer.get()))).toEqual([added.ulid]);

        const aged = currentEntry(3, Date.now() - AN_HOUR);
        expect(await app.reset([aged, currentEntry(1), currentEntry(2)])).toEqual({ ok: true });
        expect(identities(entriesOf(await viewer.get()))).toEqual(identities([aged, currentEntry(1), currentEntry(2)]));

        expect(await app.forceClearOldEntries()).toEqual({ ok: true });
        expect(identities(entriesOf(await viewer.get()))).toEqual(identities([currentEntry(1), currentEntry(2)]));
    },
};

// Instances constructed at once over old, junk, aged and newer records all serve the same entries, each upgraded entry held once.
export const siblingsStartingTogetherConverge: ConformanceClaim = {
    name: 'leaves each upgraded entry on the substrate once, and the newer record untouched, when several siblings start at once, and they all read the same entries [dec-shared-start-up-converges]',
    options: KEPT_FOR_A_MINUTE,
    skipReason: harness => unlessShared(harness) ?? unlessObservable(harness),
    async check(harness) {
        const raw = rawOf(harness);
        await readyInstance(harness);
        const now = Date.now();
        const newer = newerRecord(9, now);
        await raw.writeAll([
            unversionedEntry(1, now, { withTimestamp: true }), unversionedEntry(2, now, { withTimestamp: false }), unversionedEntry(3, now, { withTimestamp: true }),
            ...junkRecords(), currentEntry(4, now - AN_HOUR), newer,
        ]);

        const stores = await Promise.all([harness.instance(), harness.instance(), harness.instance()]);
        const reads = await Promise.all(stores.map(store => store.get()));

        const upgraded = survivingUpgrades(harness, [currentEntry(1, now), currentEntry(2, now), currentEntry(3, now)]);
        for( const read of reads ) expect(identities(entriesOf(read))).toEqual(identities(upgraded));
        await expectSubstrateHolds(raw, [...upgraded, newer]);

        const added = entryOf(await stores[0]!.add({ type: 'info', message: 'after start-up' }));
        expect(ulidsOf(entriesOf(await stores[2]!.get()))).toContain(added.ulid);
    },
};

// The substrate belongs to no instance: what one wrote stays for the others and for any built later.
export const theSubstrateOutlivesItsInstances: ConformanceClaim = {
    name: 'shows a store built later every entry earlier siblings wrote, and still shows them to those siblings [dec-shared-substrate-outlives-instances]',
    skipReason: unlessShared,
    async check(harness) {
        const [first, second] = await Promise.all([readyInstance(harness), readyInstance(harness)]);
        const written = [
            entryOf(await first.add({ type: 'info', message: 'from the first' })),
            entryOf(await second.add({ type: 'info', message: 'from the second' })),
        ];

        const later = await readyInstance(harness);

        // Compared in ulid order: call order binds one instance's writes, and siblings writing in the same
        // millisecond each mint their own ulids.
        expect(identitiesByUlid(entriesOf(await later.get()))).toEqual(identitiesByUlid(written));
        expect(identitiesByUlid(entriesOf(await first.get()))).toEqual(identitiesByUlid(written));
    },
};
