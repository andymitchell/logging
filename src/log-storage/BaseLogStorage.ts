

import { cloneDeepScalarValues } from "@andyrmitchell/utils/deep-clone-scalar-values";
import type {  MaxAge, MinimumContext } from "../types.ts";
import type { AcceptLogEntry, ILogStorage, LogEntry, LogStorageOptions } from "./types.ts";
import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import { monotonicFactory } from "ulid";
import { MemoryBreakpoints } from "../breakpoints/MemoryBreakpoints.ts";
import type { IBreakpoints } from "../breakpoints/types.ts";




export class BaseLogStorage implements ILogStorage {
    protected includeStackTrace: Required<LogStorageOptions>['include_stack_trace'];
    protected logToConsole:boolean;
    protected permitDangerousContextProperties: boolean;
    protected maxAge: MaxAge;
    protected dbNamespace:string;
    protected ulid:Function;
    breakpoints:IBreakpoints;

    constructor(dbNamespace:string, options?: LogStorageOptions) {
        const safeOptions = Object.assign({}, DEFAULT_LOGGER_OPTIONS, options);
        this.includeStackTrace = safeOptions.include_stack_trace;
        this.logToConsole = safeOptions.log_to_console;
        this.permitDangerousContextProperties = safeOptions.permit_dangerous_context_properties;
        this.dbNamespace = dbNamespace;
        this.maxAge = safeOptions.max_age;
        this.ulid = monotonicFactory(); // Monotonic guarantees ascending order within this context
        this.breakpoints = safeOptions.breakpoints;

    }

    /**
     * Remove old entries before the max age
     */
    protected async clearOldEntries() {
        throw new Error("Method not implemented");
    }

    public async reset() {
        throw new Error("Method not implemented");
    }

    /**
     * (Optionally) remove sensitive information from the context
     * @param context 
     */
    protected prepareContext(context?: any) {
        if( context ) {
            return cloneDeepScalarValues(
                context,
                true, 
                this.permitDangerousContextProperties
            )
        } else {
            return undefined;
        }
    }

    async add<C extends MinimumContext>(acceptEntry: AcceptLogEntry<C>): Promise<LogEntry<C>> {
        let stackTrace:string | undefined = this.includeStackTrace[acceptEntry.type]? this.generateStackTrace() : undefined;

        const logEntry:LogEntry = {
            ...acceptEntry,
            timestamp: Date.now(),
            context: this.prepareContext(acceptEntry.context),
            stack_trace: acceptEntry.stack_trace ?? stackTrace,
            ulid: acceptEntry.ulid ?? this.ulid()
        }
        
        await this.commitEntry(logEntry);
        this.breakpoints.test(logEntry);

        if( this.logToConsole && logEntry.type!=='event') {
            console.log(`[Log ${this.dbNamespace}] ${logEntry.message}`, logEntry.context);
        }

        return logEntry;
    }


    protected commitEntry(_entry:LogEntry):Promise<void> {
        throw new Error("Method not implemented");
    }
    

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


    public async get(filter?:WhereFilterDefinition<LogEntry>, fullTextFilter?: string): Promise<LogEntry[]> {
        throw new Error("Method not implemented");
    }

    public async forceClearOldEntries() {
        return this.clearOldEntries();
    }
    
}

const DEFAULT_LOGGER_OPTIONS:Required<LogStorageOptions> = {
    include_stack_trace: {
        info: false,
        warn: true,
        error: true,
        critical: true,
        event: false
    },
    log_to_console: false,
    permit_dangerous_context_properties: false,
    max_age: [],
    breakpoints: new MemoryBreakpoints()
}
