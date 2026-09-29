import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { LogReadResult, LoggingResult } from "../../failures/types.ts";
import { MemoryLogStorage } from "../memory/MemoryLogStorage.ts";
import type { LogEntry, LogStorageOptions } from "../types.ts";


/**
 * How a failing hook misbehaves: throw synchronously, reject, or answer with a (usually failed) result.
 * `throws` and `rejects` take any value, including ones that are not Errors (e.g. `Object.create(null)`).
 */
export type HookFailure<A extends LoggingResult = LoggingResult> =
    | { throws: unknown }
    | { rejects: unknown }
    | { answers: A };

/**
 * Which hooks fail, and how. A hook left out behaves like a healthy {@link MemoryLogStorage}.
 */
export type FailingHooks = {
    commitEntry?: HookFailure,
    // `never` entries fit every entry type a read can be asked for.
    queryEntries?: HookFailure<LogReadResult<never>>,
    resetEntries?: HookFailure,
    clearOldEntries?: HookFailure,
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

    protected override queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
        const failure = this.fail.queryEntries;
        return failure ? misbehave(failure) : super.queryEntries(filter, fullTextFilter);
    }

    protected override resetEntries(entries?: LogEntry[]): Promise<LoggingResult> {
        const failure = this.fail.resetEntries;
        return failure ? misbehave(failure) : super.resetEntries(entries);
    }

    protected override clearOldEntries(): Promise<LoggingResult> {
        const failure = this.fail.clearOldEntries;
        return failure ? misbehave(failure) : super.clearOldEntries();
    }
}


function misbehave<A extends LoggingResult>(failure: HookFailure<A>): Promise<A> {
    if ('throws' in failure) throw failure.throws;
    if ('rejects' in failure) return Promise.reject(failure.rejects);
    return Promise.resolve(failure.answers);
}
