import type { z } from "zod";
import type { LogEntry } from "../types.ts";
import type { LogEntryV1Schema } from "./log-entry-schema-versions/v1.ts";


/**
 * A log entry as written before entries carried a `format_version` (format 1): no `format_version`, and
 * `timestamp` optional.
 */
export type LogEntryV1 = z.infer<typeof LogEntryV1Schema>;


/**
 * What a record found on a store's substrate turned out to be, and so what the store should do with it.
 *
 * - `current`: already a valid entry in the current format. `entry` is the record itself.
 * - `migrated`: an entry in an older format, upgraded. The store writes `entry` back in place of the record.
 * - `newer`: written by a newer version of the library. Leave it untouched, and do not return it.
 * - `unrecognised`: junk, or an older entry that cannot be upgraded. Safe to delete.
 */
export type MigrationOutcome =
    | { status: 'current', entry: LogEntry }
    | { status: 'migrated', entry: LogEntry }
    | { status: 'newer' }
    | { status: 'unrecognised' };


/**
 * What a store's clean-up does with one record on its substrate.
 *
 * - `keep`: leave the record exactly as it is.
 * - `delete`: remove it.
 * - `replace`: write `entry` in its place (an older entry, upgraded to the current format).
 */
export type CleanUpDecision =
    | { action: 'keep' }
    | { action: 'delete' }
    | { action: 'replace', entry: LogEntry };
