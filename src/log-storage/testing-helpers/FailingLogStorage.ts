import type { LoggingResult } from "../../failures/types.ts";
import { MemoryLogStorage } from "../memory/MemoryLogStorage.ts";
import type { LogEntry, LogStorageOptions } from "../types.ts";


/**
 * How a failing hook misbehaves: throw synchronously, reject, or answer with a (usually failed) result.
 * `throws` and `rejects` take any value, including ones that are not Errors (e.g. `Object.create(null)`).
 */
export type HookFailure =
    | { throws: unknown }
    | { rejects: unknown }
    | { answers: LoggingResult };

/**
 * Which hooks fail, and how. A hook left out behaves like a healthy {@link MemoryLogStorage}.
 */
export type FailingHooks = {
    commitEntry?: HookFailure
};


/**
 * A {@link MemoryLogStorage} whose hooks fail on demand, for testing how logging copes with a broken store.
 *
 * Change `fail` at any time to start or stop failing.
 *
 * @example
 * const storage = new FailingLogStorage('my-app', { commitEntry: { throws: new Error('quota') } });
 * const result = await new Logger(storage).warn('x'); // { ok: false, entry, error }
 * storage.fail = {}; // healthy again
 */
export class FailingLogStorage extends MemoryLogStorage {
    fail: FailingHooks;

    constructor(dbNamespace: string, fail: FailingHooks = {}, options?: LogStorageOptions) {
        super(dbNamespace, options);
        this.fail = fail;
    }

    protected override commitEntry(logEntry: LogEntry): Promise<LoggingResult> {
        const failure = this.fail.commitEntry;
        return failure ? misbehave(failure) : super.commitEntry(logEntry);
    }
}


function misbehave(failure: HookFailure): Promise<LoggingResult> {
    if ('throws' in failure) throw failure.throws;
    if ('rejects' in failure) return Promise.reject(failure.rejects);
    return Promise.resolve(failure.answers);
}
