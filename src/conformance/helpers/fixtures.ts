import type { AcceptLogEntry, LogEntry } from "../../log-storage/types.ts";
import { unversionedEntry } from "../../log-storage/testing-helpers/storedRecords.ts";

// The suite is internal, so it shares the store tests' record builders rather than copying them. They move
// with the suite if it is ever exported.
export { currentEntry, junkRecords, newerRecord, unversionedEntry } from "../../log-storage/testing-helpers/storedRecords.ts";


/** A value placed inside a malformed entry, so a failure that quotes the entry can be caught. */
export const LEAK_CANARY = 'secret-shaped-value';


/** Entries a JavaScript caller, or a cast, can hand `add` that are not log entries. */
export function malformedAcceptEntries(): [label: string, entry: AcceptLogEntry][] {
    return [
        ['a message that is a number', asAccepted({ type: 'info', message: 42 })],
        ['a type no entry has', asAccepted({ type: 'shout', message: LEAK_CANARY })],
        ['a message that is an object', asAccepted({ type: 'info', message: { text: LEAK_CANARY } })],
    ];
}

/** `entry` with a `format_version` the caller chose, which the type forbids. */
export function withChosenFormatVersion(entry: AcceptLogEntry, formatVersion: number): AcceptLogEntry {
    return asAccepted({ ...entry, format_version: formatVersion });
}

/**
 * An entry from before entries were versioned that cannot be upgraded: it has no timestamp, and its id is not
 * a ulid, so its time cannot be recovered.
 */
export function unmigratableEntry(n: number, at: number = Date.now()): Record<string, unknown> {
    return { ...unversionedEntry(n, at, { withTimestamp: false }), ulid: `not-a-ulid-${n}` };
}

/** Records handed to `reset` as if they were entries, which the type forbids. */
export function asEntries(records: readonly Record<string, unknown>[]): LogEntry[] {
    return records as LogEntry[];
}

/** A value handed to `reset` in place of an array of entries, which the type forbids. */
export function asEntryList(value: unknown): LogEntry[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a value the type forbids is what is under test
    return value as any;
}

/** A revoked Proxy over an array: even asking whether it is an array throws. */
export function revokedArray(): unknown {
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    return proxy;
}


function asAccepted(entry: Record<string, unknown>): AcceptLogEntry {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- an entry the type forbids is what is under test
    return entry as any;
}
