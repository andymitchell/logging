import type { LogEntry } from "../types.ts";
import { migrateLogEntry } from "./migrateLogEntry.ts";
import type { CleanUpDecision } from "./types.ts";


/**
 * Decide what a store's clean-up does with one record on its substrate.
 *
 * Clean-up is one pass over everything a store holds. It upgrades entries written in an older format, removes
 * what it cannot read, and removes entries older than the store's `max_age`. Every store asks this function
 * about each record, so the rule lives in one place:
 * - a current entry is kept while within its max age, else deleted;
 * - an older-format entry is replaced by its upgrade while within its max age, else deleted;
 * - a record from a newer library is kept untouched, whatever its age (it is not this version's to judge);
 * - anything else (junk, or an older entry that cannot be upgraded) is deleted.
 *
 * @param record - A record read from the substrate. Untrusted.
 * @param isWithinMaxAge - The store's age test (see `createMaxAgeTest`). It is asked only about entries in the
 * current format, and only about current or upgraded ones.
 * @returns `{ action: 'keep' }`, `{ action: 'delete' }`, or `{ action: 'replace', entry }` where `entry` keeps
 * every key of the record (so a substrate's row key survives the rewrite).
 *
 * @example
 * // IndexedDB: one cursor over the object store
 * const decision = decideCleanUp(cursor.value, isWithinMaxAge);
 * if (decision.action === 'delete') cursor.delete();
 * else if (decision.action === 'replace') cursor.update(decision.entry);
 *
 * @example
 * // An in-memory array: build the new array, then assign it
 * const next = log.flatMap(record => {
 *     const decision = decideCleanUp(record, isWithinMaxAge);
 *     return decision.action === 'keep' ? [record] : decision.action === 'replace' ? [decision.entry] : [];
 * });
 *
 * @remarks
 * An age test that throws is not caught: the error reaches the caller, which abandons its whole pass so the
 * substrate is left exactly as it was (a broken `max_age` never half-cleans a store).
 */
export function decideCleanUp(record: unknown, isWithinMaxAge: (entry: LogEntry) => boolean): CleanUpDecision {
    const outcome = migrateLogEntry(record);
    switch (outcome.status) {
        case 'current': return isWithinMaxAge(outcome.entry) ? { action: 'keep' } : { action: 'delete' };
        case 'migrated': return isWithinMaxAge(outcome.entry) ? { action: 'replace', entry: outcome.entry } : { action: 'delete' };
        case 'newer': return { action: 'keep' };
        case 'unrecognised': return { action: 'delete' };
    }
}
