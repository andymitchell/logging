import { isLogEntrySimple } from "../log-storage/types.ts";
import type { LogReadResult, LogWriteResult, LoggingError, LoggingFailed, LoggingFailure, LoggingOk, LoggingOperation, LoggingResult } from "./types.ts";


/**
 * Build the successful result of a logging call.
 *
 * @returns `{ ok: true }`. Add `entry`, `entries` or `traces` to make it the result of a write, read or trace search.
 */
export function ok(): LoggingOk {
    return { ok: true };
}


/**
 * Build the failed result of a logging call from the failures behind it.
 *
 * The failures are listed in the order given, as the same objects: a failure is described once, where it
 * happened, and never re-described on the way up. The error's `message` is a one-line summary of them.
 *
 * @param failures - Every failure behind the call; at least one.
 * @returns `{ ok: false, error: { message, failures } }`. Add `entry`, `entries` or `traces` to make it the
 * result of a write, read or trace search.
 *
 * @example
 * failed({ source: 'IDBLogStorage:my-app', operation: 'write', message: 'Could not record the entry.' });
 * // { ok: false, error: { message: '[IDBLogStorage:my-app] Could not record the entry.', failures: [ … ] } }
 *
 * @example
 * return { ...failed(...childFailures), entries }; // a partial read
 */
export function failed(...failures: [LoggingFailure, ...LoggingFailure[]]): LoggingFailed {
    return {
        ok: false,
        error: {
            message: summarise(failures),
            failures: [...failures],
        },
    };
}


/**
 * Build the result of a logging call from every failure it collected: success if there were none.
 *
 * @param failures - The failures of every source the call consulted, possibly none.
 * @returns `ok()` when `failures` is empty, else `failed(...failures)`.
 */
export function resultFrom(failures: LoggingFailure[]): LoggingResult {
    const [first, ...rest] = failures;
    return first ? failed(first, ...rest) : ok();
}


/**
 * Whether `x` is a well-formed {@link LoggingResult}: `{ ok: true }` without an error, or `{ ok: false }`
 * with an error that lists at least one well-formed failure.
 *
 * Used where an answer comes from code this library does not control (a store someone else wrote), so a
 * malformed answer is caught rather than passed on to a caller who trusts the type.
 */
export function isLoggingResult(x: unknown): x is LoggingResult {
    if (typeof x !== 'object' || x === null || !('ok' in x)) return false;
    if (x.ok === true) return !('error' in x) || x.error === undefined;
    return x.ok === false && 'error' in x && isLoggingError(x.error);
}


/**
 * Whether `x` is a well-formed {@link LogWriteResult}: a {@link LoggingResult} whose `entry` is a log entry,
 * present on success and optional on failure.
 */
export function isLogWriteResult(x: unknown): x is LogWriteResult {
    if (!isLoggingResult(x)) return false;
    const entry = 'entry' in x ? x.entry : undefined;
    return x.ok ? isLogEntrySimple(entry) : entry === undefined || isLogEntrySimple(entry);
}


/**
 * Whether `x` is a well-formed {@link LogReadResult}: a {@link LoggingResult} whose `entries` is an array of log
 * entries, on success and on failure alike.
 */
export function isLogReadResult(x: unknown): x is LogReadResult {
    return isLoggingResult(x) && 'entries' in x && Array.isArray(x.entries) && x.entries.every(isLogEntrySimple);
}


function isLoggingError(x: unknown): x is LoggingError {
    return typeof x === 'object' && x !== null
        && 'message' in x && typeof x.message === 'string'
        && 'failures' in x && Array.isArray(x.failures) && x.failures.length > 0 && x.failures.every(isLoggingFailure);
}

function isLoggingFailure(x: unknown): x is LoggingFailure {
    return typeof x === 'object' && x !== null
        && 'source' in x && typeof x.source === 'string'
        && 'message' in x && typeof x.message === 'string'
        && 'operation' in x && typeof x.operation === 'string' && Object.hasOwn(LOGGING_OPERATIONS, x.operation);
}

/**
 * Every {@link LoggingOperation}. A `Record` so the compiler rejects a missing or unknown operation.
 */
const LOGGING_OPERATIONS: Record<LoggingOperation, true> = {
    write: true,
    read: true,
    reset: true,
    clear_old_entries: true,
    breakpoint: true,
    unexpected: true,
};


function summarise(failures: [LoggingFailure, ...LoggingFailure[]]): string {
    const described = failures.map(failure => `[${failure.source}] ${failure.message}`).join('; ');
    return failures.length === 1 ? described : `${failures.length} logging failures: ${described}`;
}
