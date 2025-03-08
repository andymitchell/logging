import type { WhereFilterDefinition } from "@andyrmitchell/objects";
import type { LogEntry } from "./raw-storage/types.ts";

export type MinimumContext = Record<string, any>;

export interface ILogger<T extends MinimumContext = MinimumContext, RT extends MinimumContext = T> {

    log(message: string, context?: T): Promise<void>,

    warn(message: string, context?: T): Promise<void>,
    
    error(message: string, context?: T): Promise<void>

    get(filter?:WhereFilterDefinition<LogEntry<RT>>): Promise<LogEntry<RT>[]>;

}




export interface LoggerOptions {
    include_stack_trace?: {
        info: boolean;
        warn: boolean;
        error: boolean;
        event: boolean;
    };
    log_to_console?:boolean
}