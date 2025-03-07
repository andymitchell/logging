import type { LogEntry } from "./raw-storage/types.ts";

export type MinimumContext = Record<string, any>;

export interface ILogger<T extends MinimumContext = MinimumContext, RT extends MinimumContext = T> {

    log(message: string, context?: T): Promise<void>,

    warn(message: string, context?: T): Promise<void>,
    
    error(message: string, context?: T): Promise<void>

    getAll(): Promise<LogEntry<RT>[]>;

}



export interface ISpan<T extends MinimumContext = MinimumContext> extends ILogger<T, SpanContext<T>> {

    /**
     * Create a child span with a link back to this as the parent 
     * @param name 
     * @returns 
     */
    startSpan(name?: string):ISpan

    /**
     * Adds a final timestamp for duration logging. 
     * 
     * Optional.
     */
    end():Promise<void>


}


export type TraceId = {
    id: string, 
    parent_id?: string
}

export type SpanContext<T extends MinimumContext = MinimumContext> = {
    external?: T,
    trace: TraceId
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