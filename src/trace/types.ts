

import { isEventLogEntry, type EventLogEntry, type LogCallMaskingOptions, type LogEntry, type StartEventDetail } from "../log-storage/types.ts";
import type { ILogger, MinimumContext } from "../types.ts"





export interface ISpan extends ILogger {


    /**
     * Create a child span with a link back to this as the parent 
     * @param name 
     * @returns 
     */
    startSpan(name?: string, context?: any): ISpan;

    /**
     * Like {@link ISpan.startSpan}, but `options` may keep specific values in the NEW span's OWN context (the
     * span_start entry) UNMASKED — gated by path AND value-shape, honored only by a storage with
     * `allow_per_call_unmasking`. Scope is the span's own context only; logs emitted later within the span are
     * NOT affected. @see LogCallMaskingOptions
     */
    startSpanWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, name?: string, context?: C): ISpan;

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

