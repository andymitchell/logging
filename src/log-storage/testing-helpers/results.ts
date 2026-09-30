import type { LogReadResult, LogWriteResult, LoggingError } from "../../failures/types.ts";
import type { MinimumContext } from "../../types.ts";
import type { ILogStorage, LogEntry } from "../types.ts";
import type { GetTracesResult, TraceSearchResults } from "../../trace/viewing/types.ts";


/**
 * The entry a write recorded. Fails the test, showing the error, if the write did not fully succeed.
 *
 * @example
 * const entry = entryOf(await logger.warn('slow'));
 * expect(entry.type).toBe('warn');
 */
export function entryOf<C, M>(result: LogWriteResult<C, M>): LogEntry<C, M> {
    if (result.error) throw new Error(`Expected the write to succeed, but it failed: ${JSON.stringify(result.error)}`);
    return result.entry;
}


/**
 * The entries a read returned. Fails the test, showing the error, if the read did not fully succeed — even if
 * it returned some entries, so a broken source cannot hide behind a healthy one.
 *
 * @example
 * const entries = entriesOf(await storage.get());
 * expect(entries).toHaveLength(2);
 */
export function entriesOf<T extends LogEntry>(result: LogReadResult<T>): T[] {
    if (result.error) throw new Error(`Expected the read to succeed, but it failed: ${JSON.stringify(result.error)}`);
    return result.entries;
}


/**
 * The traces a trace search returned. Fails the test, showing the error, if the search did not fully succeed.
 *
 * @example
 * const traces = tracesOf(await viewer.getTraces());
 */
export function tracesOf<T extends MinimumContext>(result: GetTracesResult<T>): TraceSearchResults<T> {
    if (result.error) throw new Error(`Expected the trace search to succeed, but it failed: ${JSON.stringify(result.error)}`);
    return result.traces;
}


/**
 * Record every error a store's failure listeners hear, from now until `stop()`.
 *
 * @example
 * const failures = recordFailures(storage);
 * await span.log('x');
 * expect(failures.heard).toEqual([]);
 */
export function recordFailures(storage: Pick<ILogStorage, 'onFailure'>): { heard: LoggingError[], stop: () => void } {
    const heard: LoggingError[] = [];
    const stop = storage.onFailure(error => { heard.push(error); });
    return { heard, stop };
}
