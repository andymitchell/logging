import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import { isLogEntrySimple, type LogEntry } from "../../raw-storage/types.ts";
import type { SpanMeta, TraceEntry } from "../types.ts";
import type { MinimumContext } from "../../types.ts";

/**
 * Definition for matching a log entry in a trace
 */
export type TraceEntryFilter<T extends MinimumContext = any> = WhereFilterDefinition<LogEntry<T, SpanMeta>>;

export type TraceResultFilter<T extends MinimumContext = any> = WhereFilterDefinition<TraceResult<T>>;

export type TraceFilter<T extends MinimumContext = any> = {
    /**
     * At least one entry in the trace must match this filter for the trace to be included.
     */
    entries_filter?: TraceEntryFilter<T>,
    /**
     * Filter the final trace results (e.g. trace timestamp).
     */
    results_filter?: TraceResultFilter<T>,
    /**
     * At least one entry in the trace must include this string anywhere in its serialised data 
     */
    entries_full_text_search?: string
}

export interface ITraceViewer {
    
    /**
     * Retrieve traces and all their entries
     * @param filter Filter the traces
     * @returns An array of trace objects; sorted by timestamp asc; each with an id, timestamp and containing an array of all entries in the trace (and an optional 'matches' list of entries just matching the traceEntryFilter)
     */
    getTraces<T extends MinimumContext = any>(filter?: TraceFilter<T>, includeAllTraceEntries?: boolean): Promise<TraceSearchResults<T>>;
}


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



export function isTraceResult(x: unknown): x is TraceResult {
    if( typeof x==='object' && x!==null && "id" in x && "logs" in x && Array.isArray(x.logs) ) {
        return x.logs.every(isLogEntrySimple);
    }
    return false;
}