
import type { IRawLogger, LogEntry } from "./raw-storage/types.ts";
import type { ILogger, MinimumContext} from "./types.ts";



/**
 * A simple logger, backed by various storage adapters.
 */
export class Logger<T extends MinimumContext = MinimumContext> implements ILogger<T> {

    

    protected storage:IRawLogger<T>;

    constructor(storage:IRawLogger<any>) {
        this.storage = storage;
    }

    async log(message: string, context?: T): Promise<void> {
        await this.storage.add({
            type: 'info',
            message,
            context
        })
    }

    async warn(message: string, context?: T): Promise<void> {
        await this.storage.add({
            type: 'warn',
            message,
            context
        })
    }

    async error(message: string, context?: T): Promise<void> {
        await this.storage.add({
            type: 'error',
            message,
            context
        })
    }

    async getAll(): Promise<LogEntry<T>[]> {
        return await this.storage.getAll();
    }

}