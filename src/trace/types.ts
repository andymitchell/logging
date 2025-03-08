import type { ILogger, MinimumContext } from "../types.ts"


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

    getId():string;

}


export type TraceId = {
    id: string, 
    parent_id?: string
}

export type SpanContext<T extends MinimumContext = MinimumContext> = {
    external?: T,
    trace: TraceId
}