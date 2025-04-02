import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type {  LogEntry } from "./raw-storage/types.ts";
import type {  IBreakpoints } from "./breakpoints/types.ts";

export type MinimumContext = Record<string, any>;

export interface ILogger<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> {

    log(message: string, context?: T): Promise<void>,

    warn(message: string, context?: T): Promise<void>,
    
    error(message: string, context?: T): Promise<void>

    get(filter?:WhereFilterDefinition<LogEntry<T, M>>): Promise<LogEntry<T, M>[]>;

}


export type MaxAge = {
    /**
     * How long should any entry be preserved?
     */
    any_ms: number,

    /**
     * Optionally keep errors for longer
     */
    error_ms?: number
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
    max_age?: MaxAge,


    /**
     * Allow context properties that are prefixed with '_dangerous' to not be stripped of sensitive data. Useful to allow some tracking IDs through.
     */
    permit_dangerous_context_properties?: boolean,

    /**
     * Set a custom IBreakpoints implementation (e.g. a different storage area). Defaults to in-memory if not provided.
     */
    breakpoints?: IBreakpoints
}