

import { cloneDeepScalarValues } from "@andyrmitchell/utils/deep-clone-scalar-values";
import type { LoggerOptions, MinimumContext } from "../types.ts";
import type { AcceptLogEntry, IRawLogger, LogEntry } from "./types.ts";
import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";




export class BaseLogger<T extends MinimumContext = MinimumContext> implements IRawLogger<T> {
    protected includeStackTrace: Required<LoggerOptions>['include_stack_trace'];
    protected logToConsole:boolean;
    protected permitDangerousContextProperties: boolean;
    protected maxAgeMs: number;
    protected dbNamespace:string;

    constructor(dbNamespace:string, options?: LoggerOptions) {
        const safeOptions = Object.assign({}, DEFAULT_LOGGER_OPTIONS, options);
        this.includeStackTrace = safeOptions.include_stack_trace;
        this.logToConsole = safeOptions.log_to_console;
        this.permitDangerousContextProperties = safeOptions.permit_dangerous_context_properties;
        this.dbNamespace = dbNamespace;
        this.maxAgeMs = safeOptions.max_age_ms;

    }

    /**
     * Remove old entries before the max age
     */
    protected async clearOldEntries() {
        throw new Error("Method not implemented");
    }


    async add(acceptEntry: AcceptLogEntry<T>): Promise<void> {
        let stackTrace:string | undefined = this.includeStackTrace[acceptEntry.type]? this.generateStackTrace() : undefined;

        const logEntry:LogEntry<T> = {
            ...acceptEntry,
            timestamp: Date.now(),
            context: acceptEntry.context? cloneDeepScalarValues(
                    acceptEntry.context,
                    true,
                    this.permitDangerousContextProperties
            ) : undefined,
            stack_trace: stackTrace,
        }
        
        await this.commitEntry(logEntry);

        if( this.logToConsole && logEntry.type!=='event') {
            console.log(`[Log ${this.dbNamespace}] ${logEntry.message}`, logEntry.context);
        }
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


    public async get(filter?:WhereFilterDefinition<LogEntry<T>>): Promise<LogEntry<T>[]> {
        throw new Error("Method not implemented");
    }

    public async forceClearOldEntries() {
        return this.clearOldEntries();
    }
    
}

const DEFAULT_LOGGER_OPTIONS:Required<LoggerOptions> = {
    include_stack_trace: {
        info: false,
        warn: true,
        error: true,
        event: false
    },
    log_to_console: false,
    permit_dangerous_context_properties: false,
    max_age_ms: Infinity
}
