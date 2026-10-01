import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import { isLogEntrySimple, type LogEntry } from "../../log-storage/types.ts";
import type { SpanMeta, TraceEntry } from "../types.ts";
import type { MinimumContext } from "../../types.ts";
import type { LoggingResult } from "../../failures/types.ts";

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
     * @param includeAllTraceEntries Fill each trace's `logs` with every entry in the trace. When `false`, `logs`
     * is empty and a filtered search's `matches` says why each trace was found. Defaults to `true`.
     * @returns `{ ok, traces, error? }`. `traces` is always an array, sorted by timestamp asc; each trace has its
     * id, the timestamp of its first entry, its entries in `logs` (and, for a filtered search, its first matching
     * entry in `matches`). When some of the store's sources failed, `traces` holds what the healthy ones returned
     * and `error` names the rest. Never rejects.
     */
    getTraces<T extends MinimumContext = any>(filter?: TraceFilter<T>, includeAllTraceEntries?: boolean): Promise<GetTracesResult<T>>;
}


/**
 * One trace and every log entry recorded under it, across all of its spans.
 *
 * @example
 * const [trace] = (await new TraceViewer(storage).getTraces()).traces;
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
 * A {@link TraceResult} returned by a search, plus the entry that made the search find it.
 */
export type TraceSearchResult<T extends MinimumContext = any> = TraceResult<T> & {

    /**
     * The trace's first entry that matched the search's entries filter or full-text search, as a one-item list.
     *
     * It holds only that first match, not every matching entry: it says why the trace was found. It is empty when
     * the search had neither an entries filter nor a full-text search, since then no entry is the reason.
     */
    matches: TraceEntry<T>[]
}

/**
 * A record of log entries, keyed on the trace id
 */
export type TraceSearchResults<T extends MinimumContext = any> = TraceSearchResult<T>[]; //Record<string, TraceResult<T>>;


/**
 * The outcome of a trace search.
 *
 * `traces` is always an array. When the underlying store consulted several sources and some failed, `traces`
 * holds what the healthy sources returned and `error` names the sources that failed, so `ok: false` can
 * arrive with traces. Render what arrived, then flag what broke.
 *
 * @example
 * const r = await viewer.getTraces();
 * setTraces(r.traces);
 * setBroken(r.error?.failures.map(f => f.source) ?? []);
 */
export type GetTracesResult<T extends MinimumContext = any> = { traces: TraceSearchResults<T> } & LoggingResult;



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