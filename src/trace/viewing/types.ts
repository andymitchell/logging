import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { LogEntry } from "../../raw-storage/types.ts";
import type { SpanMeta, TraceResult, TraceSearchResults } from "../types.ts";
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
    entries?: TraceEntryFilter<T>,
    /**
     * Filter the final trace results (e.g. trace timestamp).
     */
    results?: TraceResultFilter<T>,
    /**
     * At least one entry in the trace must include this string anywhere in its serialised data 
     */
    entries_full_text?: string
}

export interface ITraceViewer {
    
    /**
     * Retrieve traces and all their entries
     * @param filter Filter the traces
     * @returns An array of trace objects; sorted by timestamp asc; each with an id, timestamp and containing an array of all entries in the trace (and an optional 'matches' list of entries just matching the traceEntryFilter)
     */
    getTraces<T extends MinimumContext = any>(filter?: TraceFilter<T>, includeAllTraceEntries?: boolean): Promise<TraceSearchResults<T>>;
}

