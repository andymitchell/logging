import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type {  LogEntry } from "./log-storage/types.ts";


export type MinimumContext = Record<string, any>;

export interface ILogger {

    log(message: string, context?: any): Promise<LogEntry>,

    warn(message: string, context?: any): Promise<LogEntry>,
    
    error(message: string, context?: any): Promise<LogEntry>

    critical(message: string, context?: any): Promise<LogEntry>

    get(filter?:WhereFilterDefinition<LogEntry>): Promise<LogEntry[]>;

}

/**
 * Remove LogEntry if they match the filter and are older than the max_ms. 
 * 
 * It tests the filters in array order, and will only use the first match. 
 * 
 * Leave the filter empty as a catch all. 
 */
export type MaxAge = {
    filter?: WhereFilterDefinition<LogEntry>,
    max_ms: number
}[]


