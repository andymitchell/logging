import { describe, expect, it } from 'vitest';
import type { LogStorageHarnessFactory } from "../harness-types.ts";
import type { ConformanceClaim } from "../decisions/types.ts";
import { harnessFor } from "../helpers/register-rules.ts";
import { CALIBRATION_HARNESSES } from "./decoys.ts";
import * as declaredChoices from "../decisions/declared-choices/assertions.ts";
import * as entryDoors from "../decisions/entry-doors/assertions.ts";
import * as invariant from "../decisions/invariant/assertions.ts";
import * as sharedSubstrate from "../decisions/shared-substrate/assertions.ts";
import * as storedEntries from "../decisions/stored-entries/assertions.ts";


/*
 * Proves the suite can fail. Every claim is run against every harness, and the outcome must be the one declared
 * here: each correct store (control) passes every claim that binds it, and each decoy fails the claims of the
 * rule it breaks. A decoy that passes a claim of its own rule would mean the suite has a hole.
 *
 * Every pair is declared, with no wildcard: a new claim or harness does not compile until its outcomes are.
 */


/** The claim holds for the store. */
const pass = 'passes';
/** The claim fails for the store. For a decoy, the suite caught the broken rule. */
const FAIL = 'fails';
/** The claim's gate says it does not bind the store, giving a reason. */
const skip = 'not-applicable';
type Outcome = typeof pass | typeof FAIL | typeof skip;


const CLAIMS = { ...declaredChoices, ...entryDoors, ...storedEntries, ...sharedSubstrate, ...invariant } satisfies Record<string, ConformanceClaim>;
type ClaimName = keyof typeof CLAIMS;

/** The harnesses, in the order of the matrix's columns. */
const COLUMNS = [
    'memory', 'sharedMemory', 'discardingMemory',
    'acceptsAnything', 'resetAppendsAnything', 'hidesUnusualContexts', 'outOfOrderAdd',
    'leakyRead', 'cleansUpOnRead', 'neverPurges', 'purgesNewerRecords',
    'duplicatingCleanUp', 'answersBeforeCleanUp', 'snapshotOnConstruct',
    'migratesButDeclaresDiscarding', 'undeclaredSiblings', 'forgottenMigrationChoice',
] as const satisfies readonly (keyof typeof CALIBRATION_HARNESSES)[];

type OutcomeRow<Columns extends readonly unknown[]> = { readonly [Column in keyof Columns]: Outcome };

const EXPECTED: Record<ClaimName, OutcomeRow<typeof COLUMNS>> = {
    //                                         controls               add / reset / context / order   read                clean-up            shared substrate                          declared choices
    //                                         mem   shared discard   accept reset hides  order       leaky  onRead       never  newer        dup    before snap                        lies   undecl forgot
    everyCapabilityIsDeclared:                 [pass, pass, pass,      pass,  pass,  pass,  pass,      pass,  pass,        pass,  pass,        pass,  pass,  pass,                        pass,  pass,  FAIL],
    siblingsMatchTheDeclaredSubstrate:         [pass, pass, pass,      pass,  pass,  pass,  pass,      pass,  pass,        pass,  pass,        pass,  pass,  pass,                        pass,  FAIL,  pass],

    stampsTheCurrentFormatVersion:             [pass, pass, pass,      FAIL,  pass,  pass,  pass,      pass,  pass,        pass,  pass,        pass,  pass,  FAIL,                        pass,  pass,  pass],
    addRefusesNonEntries:                      [pass, pass, pass,      FAIL,  pass,  pass,  pass,      pass,  pass,        pass,  pass,        pass,  pass,  pass,                        pass,  pass,  pass],
    aRefusedAddRecordsNothing:                 [pass, pass, pass,      FAIL,  pass,  pass,  pass,      pass,  pass,        pass,  pass,        pass,  pass,  FAIL,                        pass,  pass,  pass],
    resetRefusesAnyNonEntry:                   [pass, pass, pass,      pass,  FAIL,  pass,  pass,      pass,  pass,        pass,  pass,        pass,  pass,  pass,                        pass,  pass,  pass],
    resetRefusesUnversionedEntriesAndNonLists: [pass, pass, pass,      pass,  FAIL,  pass,  pass,      pass,  pass,        pass,  pass,        pass,  pass,  pass,                        pass,  pass,  pass],
    resetReplacesWithCurrentEntries:           [pass, pass, pass,      pass,  FAIL,  pass,  pass,      pass,  pass,        pass,  pass,        pass,  pass,  pass,                        pass,  pass,  pass],
    contextAndMetaAreKeptAsLogged:             [pass, pass, pass,      pass,  pass,  FAIL,  pass,      pass,  pass,        pass,  pass,        pass,  pass,  pass,                        pass,  pass,  pass],
    addsComeBackInCallOrder:                   [pass, pass, pass,      pass,  pass,  pass,  FAIL,      pass,  pass,        pass,  pass,        pass,  pass,  pass,                        pass,  pass,  pass],

    readsCurrentEntriesWrittenUnderneath:      [pass, pass, pass,      pass,  pass,  pass,  pass,      pass,  pass,        pass,  pass,        pass,  pass,  FAIL,                        pass,  pass,  pass],
    readSkipsJunk:                             [pass, pass, pass,      pass,  pass,  pass,  pass,      FAIL,  pass,        pass,  pass,        pass,  pass,  FAIL,                        pass,  pass,  pass],
    readSkipsUnversionedEntries:               [pass, pass, pass,      pass,  pass,  pass,  pass,      FAIL,  FAIL,        pass,  pass,        pass,  pass,  FAIL,                        pass,  pass,  pass],
    newerRecordsAreLeftAlone:                  [pass, pass, pass,      pass,  pass,  pass,  pass,      FAIL,  pass,        pass,  FAIL,        pass,  pass,  pass,                        pass,  pass,  pass],
    readsNeverChangeTheSubstrate:              [pass, pass, pass,      pass,  pass,  pass,  pass,      pass,  FAIL,        pass,  pass,        pass,  pass,  pass,                        pass,  pass,  pass],
    cleanUpRemovesJunkAndAgedEntries:          [pass, pass, pass,      pass,  pass,  pass,  pass,      pass,  pass,        FAIL,  pass,        pass,  pass,  FAIL,                        pass,  pass,  pass],
    cleanUpUpgradesUnversionedEntries:         [pass, pass, skip,      pass,  pass,  pass,  pass,      pass,  pass,        FAIL,  pass,        FAIL,  pass,  FAIL,                        skip,  pass,  FAIL],
    unversionedEntriesAgeLikeCurrentOnes:      [pass, pass, pass,      pass,  pass,  pass,  pass,      pass,  pass,        FAIL,  pass,        FAIL,  pass,  FAIL,                        FAIL,  pass,  FAIL],
    cleanUpRemovesUnmigratableEntries:         [pass, pass, pass,      pass,  pass,  pass,  pass,      FAIL,  pass,        FAIL,  pass,        pass,  pass,  FAIL,                        pass,  pass,  pass],
    startUpCleanUpPrecedesTheFirstRead:        [skip, pass, pass,      skip,  skip,  skip,  skip,      skip,  skip,        skip,  skip,        FAIL,  FAIL,  pass,                        FAIL,  skip,  skip],
    callsMadeDuringStartUpAreHeld:             [skip, pass, pass,      skip,  skip,  skip,  skip,      skip,  skip,        skip,  skip,        FAIL,  FAIL,  FAIL,                        FAIL,  skip,  skip],
    cleanUpIsIdempotent:                       [pass, pass, pass,      pass,  pass,  pass,  pass,      pass,  pass,        pass,  pass,        FAIL,  pass,  FAIL,                        pass,  pass,  pass],
    discardingStoresLeaveNoOldEntries:         [skip, skip, pass,      skip,  skip,  skip,  skip,      skip,  skip,        skip,  skip,        skip,  skip,  skip,                        FAIL,  skip,  FAIL],

    siblingsSeeEachOthersWrites:               [skip, pass, pass,      skip,  skip,  skip,  skip,      skip,  skip,        skip,  skip,        pass,  pass,  FAIL,                        pass,  skip,  skip],
    siblingsStartingTogetherConverge:          [skip, pass, pass,      skip,  skip,  skip,  skip,      skip,  skip,        skip,  skip,        FAIL,  FAIL,  FAIL,                        FAIL,  skip,  skip],
    theSubstrateOutlivesItsInstances:          [skip, pass, pass,      skip,  skip,  skip,  skip,      skip,  skip,        skip,  skip,        pass,  pass,  FAIL,                        pass,  skip,  skip],

    onlyCurrentEntriesEverComeOut:             [pass, pass, pass,      FAIL,  FAIL,  FAIL,  pass,      FAIL,  pass,        FAIL,  pass,        pass,  pass,  FAIL,                        FAIL,  pass,  FAIL],
};


/**
 * What becomes of `claim` when checked against a store from `factory`, exactly as the suite checks it: a gate
 * that throws, a blank skip reason, or a failed check all count as a failure.
 *
 * @returns The outcome, and why, to show when it is not the one declared.
 */
async function outcomeOf(claim: ConformanceClaim, factory: LogStorageHarnessFactory): Promise<{ outcome: Outcome, why: string }> {
    try {
        const harness = await harnessFor({ factory }, claim);
        const reason = claim.skipReason?.(harness);
        if( reason !== undefined ) {
            return reason.trim() === '' ? { outcome: FAIL, why: 'It skipped without a reason.' } : { outcome: skip, why: reason };
        }
        await claim.check(harness);
        return { outcome: pass, why: 'Every check held.' };
    } catch(cause) {
        return { outcome: FAIL, why: cause instanceof Error ? cause.message : String(cause) };
    }
}


describe('calibrating the conformance suite against stores that each break one rule', () => {

    it('declares an outcome for every harness', () => {
        expect([...COLUMNS].sort()).toEqual(Object.keys(CALIBRATION_HARNESSES).sort());
    });

    describe.each(COLUMNS.map((harness, column) => [harness, column] as const))('%s', (harness, column) => {
        const claimNames = Object.keys(EXPECTED) as ClaimName[];
        it.each(claimNames.map(name => [name, EXPECTED[name][column]] as const))('%s %s', async (name, expected) => {
            const { outcome, why } = await outcomeOf(CLAIMS[name], CALIBRATION_HARNESSES[harness]);

            expect(outcome, why).toBe(expected);
        });
    });
});
