import type { LogStorageConformanceContext } from "../../harness-types.ts";
import { registerRules } from "../../helpers/register-rules.ts";
import { callsMadeDuringStartUpAreHeld, cleanUpIsIdempotent, cleanUpRemovesJunkAndAgedEntries, cleanUpRemovesUnmigratableEntries, cleanUpUpgradesUnversionedEntries, discardingStoresLeaveNoOldEntries, newerRecordsAreLeftAlone, readsCurrentEntriesWrittenUnderneath, readSkipsJunk, readSkipsUnversionedEntries, readsNeverChangeTheSubstrate, startUpCleanUpPrecedesTheFirstRead, unversionedEntriesAgeLikeCurrentOnes } from "./assertions.ts";


/**
 * What a store does with the records it finds on its substrate: which a read returns, and what clean-up
 * upgrades, removes or keeps. Proven by writing records straight onto the substrate, so they bind every store
 * that keeps entries and offers raw access to them.
 */
export function runStoredEntryDecisions(ctx: LogStorageConformanceContext): void {
    registerRules(ctx, [
        {
            rule: '[dec-read-skips-non-current-records] a read returns only current entries, and never changes the substrate',
            claims: [readsCurrentEntriesWrittenUnderneath, readSkipsJunk, readSkipsUnversionedEntries, readsNeverChangeTheSubstrate],
        },
        {
            rule: '[dec-newer-format-left-alone] a record a newer library wrote is never returned and never changed',
            claims: [newerRecordsAreLeftAlone],
        },
        {
            rule: '[dec-clean-up-migrates-or-purges] clean-up upgrades what it can, and removes unreadable records and aged entries',
            claims: [cleanUpRemovesJunkAndAgedEntries, cleanUpRemovesUnmigratableEntries, startUpCleanUpPrecedesTheFirstRead],
        },
        {
            rule: '[dec-migration-is-one-pure-map] clean-up upgrades each older entry in place',
            claims: [cleanUpUpgradesUnversionedEntries],
        },
        {
            rule: '[dec-unversioned-is-v1] an entry from before entries were versioned is the first format, and ages like any other',
            claims: [unversionedEntriesAgeLikeCurrentOnes],
        },
        {
            rule: '[dec-start-up-clean-up-before-first-answer] a store over a substrate that outlives it cleans up before it answers any call',
            claims: [callsMadeDuringStartUpAreHeld],
        },
        {
            rule: '[dec-clean-up-is-idempotent] cleaning up again changes nothing',
            claims: [cleanUpIsIdempotent],
        },
        {
            rule: '[dec-store-may-discard-instead-of-migrate] a store may discard older entries instead of upgrading them, if it says so',
            claims: [discardingStoresLeaveNoOldEntries],
        },
    ]);
}
