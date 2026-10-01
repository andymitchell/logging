import { describe } from 'vitest';
import type { LogStorageHarnessFactory } from "./harness-types.ts";
import { runDeclaredChoiceDecisions } from "./decisions/declared-choices/index.ts";
import { runEntryDoorDecisions } from "./decisions/entry-doors/index.ts";
import { runInvariantDecisions } from "./decisions/invariant/index.ts";
import { runSharedSubstrateDecisions } from "./decisions/shared-substrate/index.ts";
import { runStoredEntryDecisions } from "./decisions/stored-entries/index.ts";

export type * from "./harness-types.ts";

/*
 * Which claims prove each decision in spec/decisions.md. Each claim's test name carries the slug, in brackets.
 *
 * dec-log-entry-format-version              entry-doors       stampsTheCurrentFormatVersion
 * dec-format-version-stamped-by-store-only  entry-doors       stampsTheCurrentFormatVersion
 * dec-add-rejects-invalid-entry             entry-doors       addRefusesNonEntries, aRefusedAddRecordsNothing
 * dec-reset-rejects-invalid-entries         entry-doors       resetRefusesAnyNonEntry, resetRefusesUnversionedEntriesAndNonLists, resetReplacesWithCurrentEntries
 * dec-log-entry-context-is-opaque           entry-doors       contextAndMetaAreKeptAsLogged
 * dec-log-entry-meta-is-opaque              entry-doors       contextAndMetaAreKeptAsLogged
 * dec-add-preserves-call-order              entry-doors       addsComeBackInCallOrder
 * dec-read-skips-non-current-records        stored-entries    readsCurrentEntriesWrittenUnderneath, readSkipsJunk, readSkipsUnversionedEntries, readsNeverChangeTheSubstrate
 * dec-newer-format-left-alone               stored-entries    newerRecordsAreLeftAlone
 * dec-clean-up-migrates-or-purges           stored-entries    cleanUpRemovesJunkAndAgedEntries, cleanUpRemovesUnmigratableEntries, startUpCleanUpPrecedesTheFirstRead
 * dec-migration-is-one-pure-map             stored-entries    cleanUpUpgradesUnversionedEntries
 * dec-unversioned-is-v1                     stored-entries    unversionedEntriesAgeLikeCurrentOnes, oldTraceReadsBackAfterUpgrade
 * dec-start-up-clean-up-before-first-answer stored-entries    startUpCleanUpPrecedesTheFirstRead, callsMadeDuringStartUpAreHeld
 * dec-clean-up-is-idempotent                stored-entries    cleanUpIsIdempotent
 * dec-store-may-discard-instead-of-migrate  stored-entries    discardingStoresLeaveNoOldEntries
 * dec-shared-write-visibility               shared-substrate  siblingsSeeEachOthersWrites
 * dec-shared-start-up-converges             shared-substrate  siblingsStartingTogetherConverge
 * dec-shared-substrate-outlives-instances   shared-substrate  theSubstrateOutlivesItsInstances
 * dec-store-only-holds-current-entries      invariant         onlyCurrentEntriesEverComeOut
 * dec-conformance-declared-choices          declared-choices  everyCapabilityIsDeclared, siblingsMatchTheDeclaredSubstrate
 * dec-shared-substrate                      declared-choices  siblingsMatchTheDeclaredSubstrate
 * dec-conformance-harness-factory           helpers/fresh-harness.test.ts, harness-types.test.ts
 * dec-conformance-raw-only-for-substrate-claims  harness-types.test.ts
 */


/**
 * Register the `ILogStorage` conformance suite: every decision in `spec/decisions.md` that binds a store,
 * checked against stores built by `factory`.
 *
 * A store's author calls it once, from a test file, with a factory that builds a fresh substrate and the stores
 * over it (see {@link LogStorageHarnessFactory}). The suite builds a new harness inside every test, constructs
 * the store with the options that test is about, and skips, with a reason, each rule the store's declared
 * capabilities say does not bind it.
 *
 * Internal for now: it is not exported from the package.
 *
 * @param factory Builds one substrate, and the stores over it, per test.
 *
 * @example
 * runLogStorageConformance(async ({ namespace, options }) => {
 *     const store = new MemoryLogStorage(namespace, options);
 *     return {
 *         capabilities: { substrate: { mode: 'private' }, migration: { mode: 'migrates' } },
 *         instance: async () => store,
 *         dispose: async () => {},
 *     };
 * });
 */
export function runLogStorageConformance(factory: LogStorageHarnessFactory): void {
    const ctx = { factory };
    describe('ILogStorage conformance', () => {
        runDeclaredChoiceDecisions(ctx);
        runEntryDoorDecisions(ctx);
        runStoredEntryDecisions(ctx);
        runSharedSubstrateDecisions(ctx);
        runInvariantDecisions(ctx);
    });
}
