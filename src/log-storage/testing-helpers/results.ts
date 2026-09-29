import type { LogWriteResult, LoggingError } from "../../failures/types.ts";
import type { MinimumContext } from "../../types.ts";
import type { ILogStorage, LogEntry } from "../types.ts";


/**
 * The entry a write recorded. Fails the test, showing the error, if the write did not fully succeed.
 *
 * @example
 * const entry = entryOf(await logger.warn('slow'));
 * expect(entry.type).toBe('warn');
 */
export function entryOf<C, M extends MinimumContext>(result: LogWriteResult<C, M>): LogEntry<C, M> {
    if (result.error) throw new Error(`Expected the write to succeed, but it failed: ${JSON.stringify(result.error)}`);
    return result.entry;
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
