
import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { AcceptLogEntry, IRawLogger, LogEntry } from "../raw-storage/types.ts";
import type { ILogger, MinimumContext} from "../types.ts";
import { MemoryBreakpoints } from "../breakpoints/MemoryBreakpoints.ts";



/**
 * A simple logger, backed by various storage adapters.
 */
export class Logger<T extends MinimumContext = MinimumContext> implements ILogger<T> {

    

    protected storage:IRawLogger<T>;
    protected breakpoints:MemoryBreakpoints = new MemoryBreakpoints();

    constructor(storage:IRawLogger<any>) {
        this.storage = storage;
    }

    async #addToStorage(entry: AcceptLogEntry<T>):Promise<void> {
        this.breakpoints.test(entry);
        return this.storage.add(entry);
    }

    async log(message: string, context?: T): Promise<void> {
        await this.#addToStorage({
            type: 'info',
            message,
            context
        })
    }

    async warn(message: string, context?: T): Promise<void> {
        await this.#addToStorage({
            type: 'warn',
            message,
            context
        })
    }

    async error(message: string, context?: T): Promise<void> {
        await this.#addToStorage({
            type: 'error',
            message,
            context
        })
    }

    async get(filter?:WhereFilterDefinition): Promise<LogEntry<T>[]> {
        return await this.storage.get(filter);
    }

    async addBreakpoint(filter:WhereFilterDefinition):Promise<{id:string}> {
        return this.breakpoints.addBreakpoint(filter);
    }

    async removeBreakpoint(id:string):Promise<void> {
        return this.breakpoints.removeBreakpoint(id);
    }

}