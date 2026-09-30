import type { JsonValueCapped } from "@andymitchell/clone-to-json-safe";
import type { LogEntry } from "../log-storage/types.ts";
import type { MinimumContext } from "../types.ts";


/**
 * What a logging call was doing when it failed.
 *
 * - `write`: recording an entry.
 * - `read`: retrieving entries (a store's `get`, or a trace search).
 * - `reset`: replacing or clearing every entry.
 * - `clear_old_entries`: removing entries older than their maximum age.
 * - `breakpoint`: checking the entry against breakpoints after it was recorded.
 * - `unexpected`: a failure the store did not describe itself — for example a store that threw instead of
 *   answering with a result — caught by the logger or span that called it.
 */
export type LoggingOperation = 'write' | 'read' | 'reset' | 'clear_old_entries' | 'breakpoint' | 'unexpected';


/**
 * One thing that went wrong inside the logging system, described by the component where it happened.
 *
 * A failure is written once, where it happens, and passed up unchanged: a Channels store lists its
 * children's failures as they are. Every field is developer-written and JSON, so a record can be forwarded
 * to any reporter as-is.
 *
 * @example
 * { source: 'IDBLogStorage:my-app', operation: 'write', message: 'Could not record the entry.', details: { name: 'QuotaExceededError' } }
 *
 * @remarks
 * A record never contains logged data or a caught error's message, since either can quote the value that
 * failed. `details` holds structured, non-sensitive facts only (an exception's name, an HTTP status).
 */
export type LoggingFailure = {
    /**
     * The component that failed: the store's class name and namespace (e.g. `IDBLogStorage:my-app`), or
     * `Span` / `Logger` for a failure they caught themselves.
     */
    source: string,

    /**
     * What the component was doing when it failed.
     */
    operation: LoggingOperation,

    /**
     * A plain-English sentence describing the failure, written by the component's author.
     */
    message: string,

    /**
     * Structured, non-sensitive facts that help diagnose the failure, e.g. `{ name: 'QuotaExceededError' }`
     * or `{ status: 503 }`.
     */
    details?: JsonValueCapped
}


/**
 * Why a logging call did not fully succeed: a summary plus every failure behind it.
 *
 * A call that consulted several sources (e.g. a Channels store's children) lists one failure per source that
 * failed; `failures` is never empty.
 *
 * @example
 * const r = await span.warn('slow response');
 * if (r.error) reportLoggingBroken(r.error); // plain JSON, safe to forward as-is
 */
export type LoggingError = {
    /**
     * A one-line summary built from the failures, e.g. `[IDBLogStorage:my-app] Could not record the entry.`
     */
    message: string,

    /**
     * Every failure behind this error; at least one.
     */
    failures: [LoggingFailure, ...LoggingFailure[]]
}


/**
 * The success half of every logging result. `error` is declared (as absent) so it can be read without first
 * checking `ok`.
 */
export type LoggingOkResult = {
    ok: true,
    error?: never
}

/**
 * The failure half of every logging result.
 */
export type LoggingFailedResult = {
    ok: false,
    error: LoggingError
}

/**
 * The outcome of a logging call that returns no data, such as `reset` or `forceClearOldEntries`.
 *
 * Logging calls never throw or reject; they resolve one of these instead. `ok` is `true` only if every source
 * the call consulted succeeded, and `error` is present exactly when `ok` is `false`.
 *
 * @example
 * const r = await storage.reset();
 * if (r.error) console.warn(r.error.message);
 */
export type LoggingResult = LoggingOkResult | LoggingFailedResult;


/**
 * The outcome of writing a log entry, e.g. from `logger.log(...)` or `span.warn(...)`.
 *
 * On success `entry` is the recorded entry. On failure `error` says what went wrong, and `entry` is still
 * present whenever the entry was built (it may have been recorded by some sources but not others).
 * `result.entry?.ulid` and `result.error?.message` work without narrowing.
 *
 * @example
 * const r = await span.log('fetched', { count });
 * if (r.error) reportLoggingBroken(r.error);
 * else console.log(r.entry.ulid);
 */
export type LogWriteResult<C = any, M extends MinimumContext = any> =
    | ({ entry: LogEntry<C, M> } & LoggingOkResult)
    | ({ entry?: LogEntry<C, M> } & LoggingFailedResult);


/**
 * The outcome of reading log entries, e.g. from `storage.get(...)`.
 *
 * `entries` is always an array. When the read consulted several sources and some failed, `entries` holds
 * what the healthy sources returned and `error` names the sources that failed, so `ok: false` can arrive with
 * entries. Render what arrived, then flag what broke.
 *
 * @example
 * const r = await storage.get();
 * setRows(r.entries);
 * setBroken(r.error?.failures.map(f => f.source) ?? []);
 *
 * @remarks
 * `if (!r.ok) return;` discards the entries a partial read did obtain.
 */
export type LogReadResult<T extends LogEntry = LogEntry> = { entries: T[] } & LoggingResult;


/**
 * A function told whenever a logging call on a store fails.
 *
 * It receives the same {@link LoggingError} the failed call returns, once per failed call. It may be
 * asynchronous; a listener that throws or rejects is ignored and never affects the call that failed.
 *
 * @example
 * storage.onFailure(error => sentry.captureMessage(error.message, { extra: error }));
 */
export type LoggingFailureListener = (error: LoggingError) => void;
