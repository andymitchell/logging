import { type WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { LogStorageOptions } from "../types.ts";
import { BaseLogStorage } from "../BaseLogStorage.ts";
import type { LogEntry, ILogStorage } from "../types.ts";



interface ConsoleLogStorageOptions extends LogStorageOptions {
    /**
     * If true, rather than logging a LogEntry, it'll only log the arguments passed to it. 
     */
    onlyData?: boolean
}

/**
 * Send all logs to the native global `console`
 */
export class ConsoleLogStorage extends BaseLogStorage implements ILogStorage {

    #options?: ConsoleLogStorageOptions;
    
    
    

    constructor(options?: ConsoleLogStorageOptions) {
        super('', options);

        if( !console || !console.log ) throw new Error("No global 'console' found");
        
        this.#options = options;
    }

    

    protected override async commitEntry(logEntry: LogEntry): Promise<void> {

        const consoleFunctions = ['debug', 'log', 'warn', 'error'] as const;
        type ConsoleFunctions = typeof consoleFunctions[number];
        
        const map:Record<LogEntry['type'], ConsoleFunctions[number]> = {
            debug: 'debug',
            info: 'log',
            warn: 'warn',
            error: 'error',
            critical: 'error',
            event: 'log'
        }
        
        let consoleFunction = map[logEntry.type];
        if( !(consoleFunction in console) ) consoleFunction = 'log';
        
        const logFunction = console[consoleFunction as keyof Console] as (...args:any) => void;

        if( this.#options?.onlyData ) {
            if( Array.isArray(logEntry.context) ) {
                logFunction(logEntry.message, ...logEntry.context);
            } else {
                logFunction(logEntry.message, logEntry.context);
            }
        } else {
            logFunction(logEntry);
        }        
    }

    protected override async clearOldEntries(): Promise<void> {
    }


    public override async reset(entries?: LogEntry[]):Promise<void> {
    }

    public override async get<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<T[]> {
        throw new Error("Not available in ConsoleLogStorage");
    }
}
