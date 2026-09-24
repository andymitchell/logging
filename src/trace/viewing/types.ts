import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import { isLogEntrySimple, type LogEntry } from "../../log-storage/types.ts";
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


/**
 * One trace and every log entry recorded under it, across all of its spans.
 *
 * @example
 * const [trace] = await new TraceViewer(storage).getTraces();
 * console.log(trace.id, new Date(trace.timestamp), trace.logs.length);
 */
export type TraceResult<T extends MinimumContext = any> = {
    /**
     * The trace's id: the id of its root span, which every span in the trace carries as `top_id`.
     */
    id: string,

    /**
     * Timestamp of the trace's first entry, in epoch milliseconds.
     */
    timestamp: number,

    /**
     * Every log entry for the trace
     */
    logs: TraceEntry<T>[],

}

/**
 * A {@link TraceResult} returned by a search, plus the entries in it that matched the search filter.
 */
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



/**
 * Test if the variable is a {@link TraceResult}: an object with an `id` and a `logs` array of log entries.
 *
 * Useful when a value might be either a single trace or something else (e.g. a list of traces), such as a
 * component prop that accepts both.
 *
 * @param x Any value.
 * @returns `true` if `x` has an `id` and a `logs` array in which every item passes `isLogEntrySimple`.
 *
 * @example
 * if (isTraceResult(value)) render(value.logs);
 *
 * @remarks
 * A {@link TraceSearchResult} also passes, since it extends `TraceResult`.
 */
export function isTraceResult(x: unknown): x is TraceResult {
    if( typeof x==='object' && x!==null && "id" in x && "logs" in x && Array.isArray(x.logs) ) {
        return x.logs.every(isLogEntrySimple);
    }
    return false;
}