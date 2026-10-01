import { decodeTime } from "ulid";
import { LOG_ENTRY_FORMAT_VERSION } from "../version.ts";
import type { LogEntry } from "../../types.ts";
import type { LogEntryV1 } from "../types.ts";

// Format 2 is the current format. While it is current its schema is the live `LogEntrySchema` (one source of
// truth), not a copy. When format 3 arrives, this file becomes a frozen literal copy of the format-2 union and
// `v3.ts` takes the pointer to the live schema.

/**
 * A log entry in format 2: the current `LogEntrySchema`.
 */
export { LogEntrySchema as LogEntryV2Schema } from "../../schemas.ts";


/**
 * Upgrade a format-1 entry to format 2: stamp `format_version: 2` and fill a missing `timestamp` with the time
 * encoded in its ulid.
 *
 * Every other key on the record is kept as it is, including keys the schema does not know (a substrate's own
 * row key, such as IndexedDB's `id`, must survive so the row can be rewritten in place). The input is never
 * changed; a new object is returned.
 *
 * @param record - A record that parses as a format-1 entry, with any extra keys it carries.
 * @returns The format-2 entry, or `undefined` when the record has no `timestamp` and its `ulid` does not
 * encode a time, so there is nothing to date the entry by.
 *
 * @example
 * upgradeV1ToV2({ type: 'info', message: 'x', ulid: '01ARZ3NDEKTSV4RRFFQ69G5FAV' });
 * // { type: 'info', message: 'x', ulid: '01ARZ3NDEKTSV4RRFFQ69G5FAV', timestamp: 1469922850259, format_version: 2 }
 */
export function upgradeV1ToV2(record: LogEntryV1 & Record<string, unknown>): LogEntry | undefined {
    const timestamp = record.timestamp ?? timeEncodedIn(record.ulid);
    if (timestamp === undefined) return undefined;
    return { ...record, timestamp, format_version: LOG_ENTRY_FORMAT_VERSION };
}


function timeEncodedIn(ulid: string): number | undefined {
    try {
        return decodeTime(ulid);
    } catch {
        // Not a ulid (decodeTime rejects anything malformed), so it dates nothing.
        return undefined;
    }
}
