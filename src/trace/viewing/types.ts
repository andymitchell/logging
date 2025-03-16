import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { LogEntry } from "../../raw-storage/types.ts";
import type { SpanMeta, TraceResults } from "../types.ts";
import type { MinimumContext } from "../../types.ts";

/**
 * Definition for matching a log entry in a trace
 */
export type TraceEntryFilter<T extends MinimumContext = any> = WhereFilterDefinition<LogEntry<T, SpanMeta>>;


export interface ITraceViewer {
    /**
     * Retrieve all entries for traces that have at least one entry matching the criteria.
     * @param traceFilter If any entry matches this, return the entire trace around it. If undefined, return all traces.
     * @returns A record, with trace ids as the key, containing an array of all entries 
     */
    getTraces<T extends MinimumContext = any>(traceEntryFilter?:TraceEntryFilter<T>): Promise<TraceResults<T>>;
}

