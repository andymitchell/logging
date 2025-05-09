

import { isEventLogEntry, type EventLogEntry, type LogEntry, type StartEventDetail } from "../raw-storage/types.ts";
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


export function isEventLogEntrySpanStart(x: unknown): x is EventLogEntry<any, SpanMeta, StartEventDetail> {
    return isEventLogEntry(x) && x.event.name==='span_start';
}

