import type { AcceptLogEntry, ILogStorage, LogCallMaskingOptions } from "../log-storage/types.ts";
import type { MinimumContext } from "../types.ts";
import { ignoreRejection, isInsideFailureListener } from "./FailureListeners.ts";
import { failed, isLogWriteResult } from "./results.ts";
import type { LogWriteResult, LoggingFailed, LoggingFailure } from "./types.ts";


/**
 * Write an entry through `storage`, guaranteeing a result whatever the entry's values or the store does.
 *
 * This is the last line of defence behind every write a `Logger` or `Span` makes. A store built on
 * `BaseLogStorage` already answers with a result; this catches everything else: building the entry throwing,
 * or a store that throws, rejects, or answers with something that is not a write result. Each of those
 * becomes an `unexpected` failure from `source`, which is told to the store through
 * `reportInternalFailure` and returned.
 *
 * @param storage The store to write to.
 * @param source Who is writing, named in any failure: `'Logger'` or `'Span'`.
 * @param buildEntry Builds the entry. Runs inside the guard, so it may throw.
 * @param options Per-call masking directives, passed to the store unchanged.
 * @returns The store's result unchanged when it is a well-formed write result, else a failed result. Never
 * rejects.
 *
 * @remarks
 * The store is called synchronously, so an unawaited write is still recorded straight away. If
 * `reportInternalFailure` itself throws, a second `unexpected` failure saying so is added to the returned
 * error. A write started inside a failure listener does not report its failure to the store.
 */
export async function guardedWrite<M extends MinimumContext = any>(
    storage: ILogStorage,
    source: 'Logger' | 'Span',
    buildEntry: () => AcceptLogEntry,
    options?: LogCallMaskingOptions
): Promise<LogWriteResult<any, M>> {
    const reportFailure = !isInsideFailureListener();

    let entry: AcceptLogEntry;
    try {
        entry = buildEntry();
    } catch {
        return unexpected(storage, source, 'Could not build the entry from the values passed to the log call.', reportFailure);
    }

    try {
        const result: unknown = await storage.add(entry, options);
        if (isLogWriteResult(result)) return result;
        return unexpected(storage, source, 'The log storage answered the write with something that is not a write result.', reportFailure);
    } catch {
        return unexpected(storage, source, 'The log storage threw or rejected instead of answering the write with a result.', reportFailure);
    }
}


function unexpected(storage: ILogStorage, source: 'Logger' | 'Span', message: string, reportFailure: boolean): LoggingFailed {
    const failure: LoggingFailure = { source, operation: 'unexpected', message };
    const result = failed(failure);
    if (!reportFailure) return result;

    try {
        ignoreRejection(storage.reportInternalFailure(result.error));
        return result;
    } catch {
        return failed(failure, { source, operation: 'unexpected', message: "The log storage's reportInternalFailure threw." });
    }
}
