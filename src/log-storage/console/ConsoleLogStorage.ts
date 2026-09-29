import type { LogStorageOptions } from "../types.ts";
import { BaseLogStorage } from "../BaseLogStorage.ts";
import type { LogEntry, ILogStorage } from "../types.ts";
import type { LogReadResult, LoggingResult } from "../../failures/types.ts";
import { ok } from "../../failures/results.ts";



interface ConsoleLogStorageOptions extends LogStorageOptions {
    /**
     * If true, rather than logging a LogEntry, it'll only log the arguments passed to it. 
     */
    only_logger_args?: boolean
}

/**
 * Send all logs to the native global `console`.
 *
 * The console keeps nothing: `get` resolves `{ ok: true, entries: [] }`, and `reset` and
 * `forceClearOldEntries` resolve `{ ok: true }`. Behind a `ChannelsLogStorage`, reads come from the other
 * channels.
 */
export class ConsoleLogStorage extends BaseLogStorage implements ILogStorage {

    #options?: ConsoleLogStorageOptions;

    protected override readonly storeName: string = 'ConsoleLogStorage';
    
    
    

    constructor(options?: ConsoleLogStorageOptions) {
        super('', options);

        if( !console || !console.log ) throw new Error("No global 'console' found");

        this.#options = options;
    }

    

    protected override async commitEntry(logEntry: LogEntry): Promise<LoggingResult> {

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

        if( this.#options?.only_logger_args ) {
            if( Array.isArray(logEntry.context) ) {
                logFunction(logEntry.message, ...logEntry.context);
            } else {
                logFunction(logEntry.message, logEntry.context);
            }
        } else {
            logFunction(logEntry);
        }
        return ok();
    }

    // The console keeps nothing, so there is nothing to clear, reset or read.

    protected override async clearOldEntries(): Promise<LoggingResult> {
        return ok();
    }


    protected override async resetEntries(): Promise<LoggingResult> {
        return ok();
    }

    protected override async queryEntries<T extends LogEntry = LogEntry>(): Promise<LogReadResult<T>> {
        return { ok: true, entries: [] };
    }
}
