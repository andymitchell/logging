

import { cloneDeepScalarValuesAny } from "@andyrmitchell/utils/deep-clone-scalar-values";
import type {  MaxAge } from "../types.ts";
import type { AcceptLogEntry, ILogStorage, LogEntry, LogStorageOptions } from "./types.ts";
import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import { monotonicFactory } from "ulid";
import type { IBreakpoints } from "../breakpoints/types.ts";



/**
 * Use this to build specific LogStorage
 */
export class BaseLogStorage implements ILogStorage {
    protected includeStackTrace: Required<LogStorageOptions>['include_stack_trace'];
    protected logToConsole:boolean;
    protected permitDangerousContextProperties: boolean;
    protected maxAge: MaxAge;
    protected dbNamespace:string;

    /**
     * Generate an ID. 
     * 
     * @default monotonicFactory // guarantees ascending order within this context
     */
    protected ulid:Function;
    
    breakpoints?:IBreakpoints | null;

    constructor(dbNamespace:string, options?: LogStorageOptions) {
        const safeOptions = Object.assign({}, DEFAULT_LOGGER_OPTIONS, options);
        this.includeStackTrace = safeOptions.include_stack_trace;
        this.logToConsole = safeOptions.log_to_console;
        this.permitDangerousContextProperties = safeOptions.permit_dangerous_context_properties;
        this.dbNamespace = dbNamespace;
        this.maxAge = safeOptions.max_age;
        this.ulid = monotonicFactory();
        this.breakpoints = safeOptions.breakpoints;

    }

    /**
     * This is the main thing a sub class is expected to provide. Commit to storage / transport it somewhere.
     * @param _entry 
     */
    protected commitEntry(_entry:LogEntry):Promise<void> {
        throw new Error("Method not implemented");
    }

    /**
     * Remove old entries before the max age
     */
    protected async clearOldEntries() {
        throw new Error("Method not implemented");
    }


    public async forceClearOldEntries() {
        return this.clearOldEntries();
    }

    public async reset() {
        throw new Error("Method not implemented");
    }

    /**
     * (Optionally) remove sensitive information from the context during `add`
     * @param context 
     */
    protected prepareContext(context?: any) {
        if( context ) {
            return cloneDeepScalarValuesAny(
                context,
                true, 
                this.permitDangerousContextProperties
            )
        } else {
            return undefined;
        }
    }

    async add<C extends any>(acceptEntry: AcceptLogEntry<C>): Promise<LogEntry<C>> {
        let stackTrace:string | undefined = this.includeStackTrace[acceptEntry.type]? this.generateStackTrace() : undefined;

        const logEntry:LogEntry = {
            ...acceptEntry,
            timestamp: Date.now(),
            context: this.prepareContext(acceptEntry.context),
            stack_trace: acceptEntry.stack_trace ?? stackTrace,
            ulid: acceptEntry.ulid ?? this.ulid()
        }
        
        await this.commitEntry(logEntry);
        this.breakpoints?.test(logEntry);

        if( this.logToConsole && logEntry.type!=='event') {
            console.log(`[Log ${this.dbNamespace}] ${logEntry.message}`, logEntry.context);
        }

        return logEntry;
    }

    

    /**
     * Helper to create a stack trace back to before the log call. 
     * @returns 
     */
    protected generateStackTrace() {
        try {
            throw new Error('Generate stack trace');
        } catch (e) {
            if (e instanceof Error) {
                let stack = e.stack || 'No stack trace available';
                // Remove the first lines containing the error message and this function call line
                stack = stack.split('\n').slice(3).join('\n');
                return stack;
            }
            return 'Error object is not an instance of Error';
        }
    }


    public async get<T extends LogEntry = LogEntry>(filter?:WhereFilterDefinition<T>, fullTextFilter?: string): Promise<T[]> {
        throw new Error("Method not implemented");
    }

    
}

const DEFAULT_LOGGER_OPTIONS:Required<LogStorageOptions> = {
    include_stack_trace: {
        debug: false,
        info: false,
        warn: true,
        error: true,
        critical: true,
        event: false
    },
    log_to_console: false,
    permit_dangerous_context_properties: false,
    max_age: [],
    breakpoints: null
}
