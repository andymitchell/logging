
import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { AcceptLogEntry, ILogStorage, LogCallMaskingOptions, LogEntry } from "../log-storage/types.ts";
import type { ILogger, InferContextTypeFromLogArgsWithoutMessage, MinimumContext } from "../types.ts";
import { normalizeArgs } from "../utils/normalizeArgs.ts";




/**
 * A simple logger, backed by various storage adapters.
 */
export class Logger implements ILogger {

    

    protected storage:ILogStorage;


    constructor(storage:ILogStorage) {
        this.storage = storage;
    }

    async #addToStorage<C extends MinimumContext = MinimumContext>(entry: AcceptLogEntry, options?: LogCallMaskingOptions<C>):Promise<LogEntry> {
        // The storage boundary (`add`) is intentionally non-generic (dec-add-boundary-non-generic): typed paths
        // live only at the `*WithOptions` call sites. Widening a `C`-narrowed directive to string paths is sound
        // — every dot-path of `C` IS a string — but TS can't prove it for an abstract `C` (the path type is
        // invariant in `C`), so the widening is asserted here, at the single internal hand-off.
        const logEntry = this.storage.add(entry, options as LogCallMaskingOptions | undefined);
        return logEntry;
    }

    async debug<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>>> {
        return await this.#addToStorage({
            type: 'debug',
            ...normalizeArgs([message, ...context]) // message + context
        })
    }

    async log<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>>> {
        return await this.#addToStorage({
            type: 'info',
            ...normalizeArgs([message, ...context]) // message + context
        })
    }

    async warn<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>>> {
        return await this.#addToStorage({
            type: 'warn',
            ...normalizeArgs([message, ...context]) // message + context
        })
    }

    async error<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>>> {
        return await this.#addToStorage({
            type: 'error',
            ...normalizeArgs([message, ...context]) // message + context
        })
    }

    async critical<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>>> {
        return await this.#addToStorage({
            type: 'critical',
            ...normalizeArgs([message, ...context]) // message + context
        })
    }


    async debugWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C>> {
        return await this.#addToStorage({
            type: 'debug',
            ...normalizeArgs([message, context]) // single context, masked per `options`
        }, options)
    }

    async logWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C>> {
        return await this.#addToStorage({
            type: 'info',
            ...normalizeArgs([message, context])
        }, options)
    }

    async warnWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C>> {
        return await this.#addToStorage({
            type: 'warn',
            ...normalizeArgs([message, context])
        }, options)
    }

    async errorWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C>> {
        return await this.#addToStorage({
            type: 'error',
            ...normalizeArgs([message, context])
        }, options)
    }

    async criticalWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C>> {
        return await this.#addToStorage({
            type: 'critical',
            ...normalizeArgs([message, context])
        }, options)
    }


    async get(filter?:WhereFilterDefinition): Promise<LogEntry[]> {
        return await this.storage.get(filter);
    }

}