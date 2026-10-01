import { isLogEntry } from "../schemas.ts";
import type { LogEntry } from "../types.ts";
import { LogEntryV1Schema } from "./log-entry-schema-versions/v1.ts";
import { upgradeV1ToV2 } from "./log-entry-schema-versions/v2.ts";
import type { LogEntryV1, MigrationOutcome } from "./types.ts";
import { LOG_ENTRY_FORMAT_VERSION } from "./version.ts";


/**
 * Work out what a record found on a store's substrate is, upgrading it to the current format when it is an
 * older entry.
 *
 * A store that outlives one version of the library (IndexedDB, a file, a server) can hold entries written in an
 * older format, entries written by a newer version of the library, and anything else another script put there.
 * Every store reads its substrate through this one map, so they all agree on which is which.
 *
 * @param record - Anything read from the substrate. Untrusted: it may not be an object at all.
 * @returns
 * - `{ status: 'current', entry }`: a valid entry in the current format; `entry` is `record` itself, so keys the
 *   substrate added (IndexedDB's `id`) are still on it.
 * - `{ status: 'migrated', entry }`: an older entry, upgraded. `entry` is a new object carrying every key of
 *   `record`; the store writes it back in place of the record.
 * - `{ status: 'newer' }`: written by a newer library. Leave it untouched and do not return it.
 * - `{ status: 'unrecognised' }`: junk, or an older entry that cannot be upgraded. Safe to delete.
 *
 * Never throws, and never changes `record`.
 *
 * @example
 * // A store's clean-up pass
 * for (const record of substrate) {
 *     const outcome = migrateLogEntry(record);
 *     switch (outcome.status) {
 *         case 'current': keep(record); break;
 *         case 'migrated': replace(record, outcome.entry); break;
 *         case 'newer': keep(record); break;
 *         case 'unrecognised': remove(record); break;
 *     }
 * }
 *
 * @example
 * // Restoring entries saved by an older library: `reset` accepts only current entries
 * const entries = backup.flatMap(record => {
 *     const outcome = migrateLogEntry(record);
 *     return outcome.status === 'current' || outcome.status === 'migrated' ? [outcome.entry] : [];
 * });
 * await storage.reset(entries);
 *
 * @remarks
 * The format is read from `format_version`, never guessed by trying each historic schema in turn: a version says
 * which writer produced the record, so "newer than me" is told apart from "corrupt", and a record costs one
 * comparison, plus one parse.
 *
 * An upgraded entry is checked against the current schema before it is returned, so a faulty upgrade step
 * yields `unrecognised`, never a malformed entry.
 *
 * To introduce format N+1: freeze `log-entry-schema-versions/vN.ts` into a literal copy of the current union,
 * add `vN+1.ts` holding the pointer to the live schema and `upgradeVNToVN+1`, bump `LOG_ENTRY_FORMAT_VERSION`,
 * and chain the new step after the earlier ones. Never edit a frozen version file.
 */
export function migrateLogEntry(record: unknown): MigrationOutcome {
    try {
        return classify(record);
    } catch {
        // A record that cannot even be read (a Proxy whose traps throw, a throwing getter) is not an entry.
        return UNRECOGNISED;
    }
}


/**
 * Whether a record is a valid entry in the current format, exactly as a store returns it.
 *
 * It is the check a store applies to every record before it leaves the store, and to every entry before it is
 * written. An older entry is `false` here (it is current only once migrated), as is a newer one.
 *
 * @param record - Anything. Untrusted.
 * @returns `true` only when `record` carries the current `format_version` and parses under `LogEntrySchema`.
 * Never throws.
 *
 * @example
 * const readable = rows.filter(isCurrentLogEntry); // LogEntry[]
 */
export function isCurrentLogEntry(record: unknown): record is LogEntry {
    return migrateLogEntry(record).status === 'current';
}


const UNRECOGNISED: MigrationOutcome = { status: 'unrecognised' };
const NEWER: MigrationOutcome = { status: 'newer' };


function classify(record: unknown): MigrationOutcome {
    // 1. Only an object can be an entry. (IndexedDB cannot even hold a bare value as a row.)
    if (typeof record !== 'object' || record === null || Array.isArray(record)) return UNRECOGNISED;

    // 2. The current format: valid under the current schema, or not an entry at all. The record itself is the
    //    entry, so keys the substrate added survive (a schema parse would strip them).
    const version = 'format_version' in record ? record.format_version : undefined;
    if (version === LOG_ENTRY_FORMAT_VERSION) return isLogEntry(record) ? { status: 'current', entry: record } : UNRECOGNISED;

    // 3. A later format, from a newer library: never this version's to judge.
    if (typeof version === 'number' && Number.isInteger(version) && version > LOG_ENTRY_FORMAT_VERSION) return NEWER;

    // 4. No version: format 1.
    if (version === undefined) return migrateFromV1(record);

    // 5. Anything else (1 or 0, which no writer ever stamped; a fraction; a string; null) is not a format.
    return UNRECOGNISED;
}


function migrateFromV1(record: object): MigrationOutcome {
    if (!isLogEntryV1(record)) return UNRECOGNISED;

    // Spread so every key of the original is kept, and the original is never changed.
    const upgraded = upgradeV1ToV2({ ...record });

    // Fail closed: an upgrade that does not produce a current entry yields nothing.
    return upgraded !== undefined && isLogEntry(upgraded) ? { status: 'migrated', entry: upgraded } : UNRECOGNISED;
}


function isLogEntryV1(record: unknown): record is LogEntryV1 {
    return LogEntryV1Schema.safeParse(record).success;
}
