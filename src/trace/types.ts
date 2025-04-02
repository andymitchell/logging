

import { isEventLogEntry, isLogEntrySimple, type EventLogEntry, type LogEntry, type StartEventDetail } from "../raw-storage/types.ts";
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

    getFullId():SpanId

}



export type SpanId = {
    id: string, 
    top_id: string
    parent_id?: string,
}

export type SpanMeta= {
    type: 'span',
    span: SpanId
}

export type TraceEntry<T extends MinimumContext = MinimumContext> = LogEntry<T, SpanMeta>;


export type TraceResult<T extends MinimumContext = any> = {
    id: string, 
    timestamp: number,

    /**
     * Every log entry for the trace
     */
    logs: TraceEntry<T>[],

}

export type TraceSearchResult<T extends MinimumContext = any> = TraceResult<T> & {
    
    /**
     * Entries that match the filter, if provided 
     */
    matches: TraceEntry<T>[]
}

/**
 * A record of log entries, keyed on the trace id
 */
export type TraceSearchResults<T extends MinimumContext = any> = TraceSearchResult<T>[]; //Record<string, TraceResult<T>>;


export function isEventLogEntrySpanStart(x: unknown): x is EventLogEntry<any, SpanMeta, StartEventDetail> {
    return isEventLogEntry(x) && x.event.name==='span_start';
}

export function isTraceResult(x: unknown): x is TraceResult {
    if( typeof x==='object' && x!==null && "id" in x && "logs" in x && Array.isArray(x.logs) ) {
        return x.logs.every(isLogEntrySimple);
    }
    return false;
}