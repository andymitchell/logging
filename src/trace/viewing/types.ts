import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { LogEntry } from "../../raw-storage/types.ts";
import type { SpanMeta, TraceResult, TraceResults } from "../types.ts";
import type { MinimumContext } from "../../types.ts";

/**
 * Definition for matching a log entry in a trace
 */
export type TraceEntryFilter<T extends MinimumContext = any> = WhereFilterDefinition<LogEntry<T, SpanMeta>>;

export type TraceResultFilter<T extends MinimumContext = any> = WhereFilterDefinition<TraceResult<T>>;


export interface ITraceViewer {
    
    /**
     * Retrieve traces and all their entries
     * @param rawLogger The storage of the entries
     * @param traceEntryFilter Optional. At least one entry in the trace must match this filter for the trace to be included.
     * @param traceResultFilter Optional. Filter the final trace results (e.g. timestamp).
     * @returns A record, with trace ids as the key, containing an array of all entries in the trace (and an optional 'matches' list of entries just matching the traceEntryFilter)
     */
    getTraces<T extends MinimumContext = any>(traceEntryFilter?:TraceEntryFilter<T>, traceResultFilter?: TraceResultFilter<T>): Promise<TraceResults<T>>;
}

