import type { LogStorageConformanceContext } from "../../harness-types.ts";
import { registerRules } from "../../helpers/register-rules.ts";
import { addRefusesNonEntries, addsComeBackInCallOrder, aRefusedAddRecordsNothing, contextAndMetaAreKeptAsLogged, readEntriesAreAsRecorded, resetRefusesAnyNonEntry, resetRefusesUnversionedEntriesAndNonLists, resetReplacesWithCurrentEntries, stampsTheCurrentFormatVersion } from "./assertions.ts";


/**
 * The doors through which entries enter a store (`add` and `reset`), and what an entry may hold. Proven through
 * the interface alone, so they bind every store, including those that keep nothing.
 */
export function runEntryDoorDecisions(ctx: LogStorageConformanceContext): void {
    registerRules(ctx, [
        {
            rule: '[dec-log-entry-format-version] [dec-format-version-stamped-by-store-only] every entry carries the format version of the library that recorded it, stamped by the store',
            claims: [stampsTheCurrentFormatVersion],
        },
        {
            rule: '[dec-add-rejects-invalid-entry] add refuses anything that is not an entry, and records nothing of it',
            claims: [addRefusesNonEntries, aRefusedAddRecordsNothing],
        },
        {
            rule: '[dec-reset-rejects-invalid-entries] reset refuses the whole call if any entry is not a current entry',
            claims: [resetRefusesAnyNonEntry, resetRefusesUnversionedEntriesAndNonLists, resetReplacesWithCurrentEntries],
        },
        {
            rule: '[dec-log-entry-context-is-opaque] [dec-log-entry-meta-is-opaque] context and meta are whatever was logged',
            claims: [contextAndMetaAreKeptAsLogged],
        },
        {
            rule: '[dec-read-returns-entries-as-recorded] a read returns each entry as it was recorded, ready to be written to any store',
            claims: [readEntriesAreAsRecorded],
        },
        {
            rule: '[dec-add-preserves-call-order] entries come back in the order add was called',
            claims: [addsComeBackInCallOrder],
        },
    ]);
}
