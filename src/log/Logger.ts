
import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { ILogStorage, LogCallMaskingOptions, LogEntry, LogEntryType } from "../log-storage/types.ts";
import type { ILogger, InferContextTypeFromLogArgsWithoutMessage, MinimumContext } from "../types.ts";
import type { LogReadResult, LogWriteResult } from "../failures/types.ts";
import { normalizeArgs } from "../utils/normalizeArgs.ts";
import { guardedRead, guardedWrite } from "../failures/guardedCalls.ts";
import { assertLogStorage } from "../log-storage/assertLogStorage.ts";




/**
 * A simple logger, backed by various storage adapters.
 *
 * Logging never breaks the caller's control flow: every write resolves a {@link LogWriteResult} and never
 * throws or rejects, whatever the store does or whatever value is logged.
 *
 * @example
 * const logger = new Logger(storage);
 * const r = await logger.warn('cache miss', { key });
 * if (r.error) reportLoggingBroken(r.error);
 */
export class Logger implements ILogger {



    protected storage:ILogStorage;


    /**
     * @param storage The store every entry is written to.
     * @throws TypeError if `storage` lacks `onFailure` or `reportInternalFailure` (a store that does not
     * implement {@link ILogStorage}).
     */
    constructor(storage:ILogStorage) {
        assertLogStorage(storage, 'Logger');
        this.storage = storage;
    }

    #write<C extends MinimumContext = MinimumContext>(type: Exclude<LogEntryType, 'event'>, args: unknown[], options?: LogCallMaskingOptions<C>):Promise<LogWriteResult> {
        // The storage boundary (`add`) is intentionally non-generic (dec-add-boundary-non-generic): typed paths
        // live only at the `*WithOptions` call sites. Widening a `C`-narrowed directive to string paths is sound
        // — every dot-path of `C` IS a string — but TS can't prove it for an abstract `C` (the path type is
        // invariant in `C`), so the widening is asserted here, at the single internal hand-off.
        return guardedWrite(this.storage, 'Logger', () => ({ type, ...normalizeArgs(args) }), options as LogCallMaskingOptions | undefined);
    }

    async debug<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>>> {
        return this.#write('debug', [message, ...context]); // message + context
    }

    async log<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>>> {
        return this.#write('info', [message, ...context]);
    }

    async warn<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>>> {
        return this.#write('warn', [message, ...context]);
    }

    async error<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>>> {
        return this.#write('error', [message, ...context]);
    }

    async critical<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>>> {
        return this.#write('critical', [message, ...context]);
    }


    async debugWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C>> {
        return this.#write('debug', [message, context], options); // single context, masked per `options`
    }

    async logWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C>> {
        return this.#write('info', [message, context], options);
    }

    async warnWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C>> {
        return this.#write('warn', [message, context], options);
    }

    async errorWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C>> {
        return this.#write('error', [message, context], options);
    }

    async criticalWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C>> {
        return this.#write('critical', [message, context], options);
    }


    async get(filter?:WhereFilterDefinition<LogEntry>): Promise<LogReadResult> {
        return guardedRead(this.storage, 'Logger', () => this.storage.get(filter));
    }

}
