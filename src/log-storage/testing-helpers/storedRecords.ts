import { encodeTime } from "ulid";
import type { LogEntry } from "../types.ts";
import { LOG_ENTRY_FORMAT_VERSION } from "../format/index.ts";


/**
 * Records a store may find on its substrate, for tests that write straight to it. Every builder is
 * deterministic, so two calls with the same arguments build equal records.
 */


/**
 * A valid ulid whose time is `ms`. `n` keeps ids written in the same millisecond distinct.
 *
 * @example
 * decodeTime(ulidAt(1_000, 7)); // 1_000
 */
export function ulidAt(ms: number, n: number): string {
    return encodeTime(ms, 10) + String(n).padStart(16, '0');
}

/** A current entry, exactly as a store records one. */
export function currentEntry(n: number, at: number = Date.now()): LogEntry {
    return { type: 'info', message: `entry ${n}`, timestamp: at, ulid: ulidAt(at, n), format_version: LOG_ENTRY_FORMAT_VERSION };
}

/**
 * An entry as a library from before entries were versioned wrote it: no `format_version`, and the timestamp
 * optional. Its ulid encodes `at`, so the time survives when the timestamp is left out.
 */
export function unversionedEntry(n: number, at: number, { withTimestamp }: { withTimestamp: boolean }): Record<string, unknown> {
    const { format_version: _version, timestamp, ...unversioned } = currentEntry(n, at);
    return withTimestamp ? { ...unversioned, timestamp } : unversioned;
}

/** A record a newer library wrote. The extra field shows whether it was left untouched. */
export function newerRecord(n: number, at: number = Date.now()): Record<string, unknown> {
    return { ...currentEntry(n, at), format_version: LOG_ENTRY_FORMAT_VERSION + 1, from_the_future: true };
}

/**
 * Records that are not entries in any format: what another script, or a bug, could leave on a substrate.
 * Object-shaped only, since IndexedDB cannot hold a bare value.
 */
export function junkRecords(): Record<string, unknown>[] {
    return [
        { nonsense: true },
        { ...currentEntry(90), message: undefined },
        { ...currentEntry(91), type: 'shout' },
        { ...currentEntry(92), format_version: '2' },
        { type: 'info', message: 'unversioned with an id that is not a ulid', ulid: 'not-a-ulid' },
        { type: 'info', message: 'unversioned with a numeric id', ulid: 7, timestamp: Date.now() },
    ];
}
