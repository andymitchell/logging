import type { ILogger, MinimumContext } from "../types.ts"



export interface ISpan<T extends MinimumContext = MinimumContext> extends ILogger<T, SpanContext> {

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

export type SpanContext= {
    trace: TraceId,
    name?: string
}