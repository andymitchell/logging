
import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { AcceptLogEntry, ILogStorage, LogEntry } from "../log-storage/types.ts";
import type { ILogger, InferContextTypeFromLogArgsWithoutMessage} from "../types.ts";
import { normalizeArgs } from "../utils/normalizeArgs.ts";




/**
 * A simple logger, backed by various storage adapters.
 */
export class Logger implements ILogger {

    

    protected storage:ILogStorage;


    constructor(storage:ILogStorage) {
        this.storage = storage;
    }

    async #addToStorage(entry: AcceptLogEntry):Promise<LogEntry> {
        const logEntry = this.storage.add(entry);
        return logEntry;
    }

    async debug<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>>> {
        return await this.#addToStorage({
            type: 'info', // TODO
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


    async get(filter?:WhereFilterDefinition): Promise<LogEntry[]> {
        return await this.storage.get(filter);
    }

}