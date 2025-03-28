import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { AcceptLogEntry, LogEntry } from "./raw-storage/types.ts";

export type MinimumContext = Record<string, any>;

export interface ILogger<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> {

    log(message: string, context?: T): Promise<void>,

    warn(message: string, context?: T): Promise<void>,
    
    error(message: string, context?: T): Promise<void>

    get(filter?:WhereFilterDefinition<LogEntry<T, M>>): Promise<LogEntry<T, M>[]>;

    /**
     * Trigger a call to the global break function when a log with a certain pattern is detected
     * @param filter 
     */
    addBreakpoint(filter:WhereFilterDefinition<AcceptLogEntry<T, M>>):Promise<{id:string}>;

    removeBreakpoint(id:string):Promise<void>;
}




export interface LoggerOptions {
    include_stack_trace?: {
        info: boolean;
        warn: boolean;
        error: boolean;
        event: boolean;
    };
    log_to_console?:boolean,

    /**
     * Cull logs older than this 
     */
    max_age_ms?: number,

    /**
     * Allow context properties that are prefixed with '_dangerous' to not be stripped of sensitive data. Useful to allow some tracking IDs through.
     */
    permit_dangerous_context_properties?: boolean
}