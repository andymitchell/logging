
import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { AcceptLogEntry, IRawLogger, LogEntry } from "../raw-storage/types.ts";
import type { ILogger, MinimumContext} from "../types.ts";




/**
 * A simple logger, backed by various storage adapters.
 */
export class Logger<T extends MinimumContext = MinimumContext> implements ILogger<T> {

    

    protected storage:IRawLogger<T>;


    constructor(storage:IRawLogger<any>) {
        this.storage = storage;
    }

    async #addToStorage(entry: AcceptLogEntry<T>):Promise<LogEntry<T>> {
        const logEntry = this.storage.add(entry);
        return logEntry;
    }

    async log(message: string, context?: T): Promise<LogEntry<T>> {
        return await this.#addToStorage({
            type: 'info',
            message,
            context
        })
    }

    async warn(message: string, context?: T): Promise<LogEntry<T>> {
        return await this.#addToStorage({
            type: 'warn',
            message,
            context
        })
    }

    async error(message: string, context?: T): Promise<LogEntry<T>> {
        return await this.#addToStorage({
            type: 'error',
            message,
            context
        })
    }

    async get(filter?:WhereFilterDefinition): Promise<LogEntry<T>[]> {
        return await this.storage.get(filter);
    }

}