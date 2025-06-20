
import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { AcceptLogEntry, ILogStorage, LogEntry } from "../log-storage/types.ts";
import type { ILogger} from "../types.ts";




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

    async log(message: string, context?: any): Promise<LogEntry> {
        return await this.#addToStorage({
            type: 'info',
            message,
            context
        })
    }

    async warn(message: string, context?: any): Promise<LogEntry> {
        return await this.#addToStorage({
            type: 'warn',
            message,
            context
        })
    }

    async error(message: string, context?: any): Promise<LogEntry> {
        return await this.#addToStorage({
            type: 'error',
            message,
            context
        })
    }


    async critical(message: string, context?: any): Promise<LogEntry> {
        return await this.#addToStorage({
            type: 'critical',
            message,
            context
        })
    }

    async get(filter?:WhereFilterDefinition): Promise<LogEntry[]> {
        return await this.storage.get(filter);
    }

}