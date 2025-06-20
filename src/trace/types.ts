

import { isEventLogEntry, type EventLogEntry, type LogEntry, type StartEventDetail } from "../log-storage/types.ts";
import type { ILogger, MinimumContext } from "../types.ts"





export interface ISpan extends ILogger {


    /**
     * Create a child span with a link back to this as the parent 
     * @param name 
     * @returns 
     */
    startSpan(name?: string, context?: any): ISpan;

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

export type TraceEntry<C extends MinimumContext = any> = LogEntry<C, SpanMeta>;


export function isEventLogEntrySpanStart(x: unknown): x is EventLogEntry<any, SpanMeta, StartEventDetail> {
    return isEventLogEntry(x) && x.event.name==='span_start';
}

