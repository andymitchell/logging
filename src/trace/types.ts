
import type {  LogEntry } from "../raw-storage/types.ts";
import type { ILogger, MinimumContext } from "../types.ts"

type TraceEntry<T extends MinimumContext = MinimumContext> = LogEntry<T, SpanMeta>;
export type TraceEntries<T extends MinimumContext = MinimumContext> = Record<string, TraceEntry<T>[]>;


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

}


export type TraceId = {
    id: string, 
    top_id: string
    parent_id?: string,
}

export type SpanMeta= {
    trace: TraceId,
    name?: string
}