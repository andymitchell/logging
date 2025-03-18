

import type { LogEntry } from "../raw-storage/types.ts";
import type { ILogger, MinimumContext } from "../types.ts"





export interface ISpan<T extends MinimumContext = MinimumContext> extends ILogger<T, SpanMeta> {


    /**
     * Create a child span with a link back to this as the parent 
     * @param name 
     * @returns 
     */
    startSpan<CT extends MinimumContext = T>(name?: string, context?: CT): ISpan<CT>;

    /**
     * Adds a final timestamp for duration logging. 
     * 
     * Optional.
     */
    end():Promise<void>

    getId():string;

    getFullId():TraceId

}


export type TraceId = {
    id: string, 
    top_id: string
    parent_id?: string,
}

export type SpanMeta= {
    type: 'span',
    trace: TraceId,
    name?: string
}

export type TraceEntry<T extends MinimumContext = MinimumContext> = LogEntry<T, SpanMeta>;
export type TraceResult<T extends MinimumContext = any> = {
    id: string, 
    timestamp: number,

    /**
     * Every log entry for the trace
     */
    all: TraceEntry<T>[],

    /**
     * Entries that match the filter, if provided 
     */
    matches: TraceEntry<T>[]
}
/**
 * A record of log entries, keyed on the trace id
 */
export type TraceResults<T extends MinimumContext = any> = Record<string, TraceResult<T>>;