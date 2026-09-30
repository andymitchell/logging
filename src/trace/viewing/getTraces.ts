import { matchJavascriptObject } from "@andymitchell/objects/where-filter";
import type { ILogStorage, LogEntry } from "../../log-storage/types.ts";
import type { MinimumContext } from "../../types.ts";
import type { GetTracesResult, TraceEntryFilter, TraceFilter, TraceSearchResult } from "./types.ts";
import type { SpanMeta } from "../types.ts";
import type { LoggingFailure } from "../../failures/types.ts";
import { createLoggingFailedResult, resultFrom } from "../../failures/results.ts";
import { guardedRead } from "../../failures/guardedCalls.ts";





/**
 * Retrieve traces and all their entries.
 *
 * Reads the store once, groups its entries into traces, and keeps each trace with an entry matching the filter.
 * Every failure is passed on in the result, alongside the traces that could still be assembled; nothing throws
 * or rejects.
 *
 * @param rawLogger The storage of the entries
 * @param filter Filter the traces
 * @param includeAllTraceEntries Fill each trace's `logs` with every entry in the trace. When `false`, `logs` is
 * empty and a filtered search's `matches` says why each trace was found. Defaults to `true`.
 * @returns The traces, sorted by timestamp asc; each with its id (its root span's id), the timestamp of its first
 * entry, its entries in `logs`, and, when the search had an entries filter or full-text search, its first
 * matching entry in `matches`. `ok` is `false` if the read failed (the traces are built from whatever entries it
 * returned), or if the filters could not be applied to every entry or trace (those are left out).
 *
 * @remarks
 * Reading once means every trace comes from the same snapshot of the store, and a search made from inside a
 * failure listener does not tell the listener about its own failure (the store is called before this returns).
 */
export async function getTraces<T extends MinimumContext = any>(rawLogger:ILogStorage, filter?: TraceFilter<T>, includeAllTraceEntries = true): Promise<GetTracesResult<T>> {
    try {
        return await searchTraces(rawLogger, filter, includeAllTraceEntries);
    } catch {
        // The read is guarded, so only a bug in assembling the traces reaches here.
        return { ...createLoggingFailedResult({ source: 'TraceViewer', operation: 'unexpected', message: 'Could not assemble the traces from the entries read.' }), traces: [] };
    }
}


async function searchTraces<T extends MinimumContext = any>(rawLogger:ILogStorage, filter: TraceFilter<T> | undefined, includeAllTraceEntries: boolean): Promise<GetTracesResult<T>> {

    const read = await guardedRead(rawLogger, 'TraceViewer', () => rawLogger.get<LogEntry<any, SpanMeta>>());

    // Lock matches to just span entries in the log
    const lockedTraceEntryFilter:TraceEntryFilter = filter?.entries_filter? {...filter.entries_filter, 'meta.type': 'span'} : {'meta.type': 'span'};
    const fullText = filter?.entries_full_text_search;
    const isMatch = (entry: LogEntry<any, SpanMeta>) => matchJavascriptObject<LogEntry<any, SpanMeta>>(entry, lockedTraceEntryFilter) && (!fullText || JSON.stringify(entry).includes(fullText));
    const recordMatches = !!(filter?.entries_filter || fullText);

    let unmatchableEntries = false;
    const found: TraceSearchResult<T>[] = [];
    for( const [id, entries] of groupByTrace(read.entries) ) {
        const { kept: matching, unmatchable } = keepMatching(entries, isMatch);
        unmatchableEntries ||= unmatchable;
        const [firstMatch] = matching;
        if( !firstMatch ) continue;
        found.push({
            id,
            timestamp: entries[0]!.timestamp,
            logs: includeAllTraceEntries? entries : [],
            matches: recordMatches? [firstMatch] : []
        });
    }

    // Filter the final results
    const resultsFilter = filter?.results_filter;
    const { kept: traces, unmatchable: unmatchableTraces } = resultsFilter? keepMatching(found, trace => matchJavascriptObject(trace, resultsFilter)) : { kept: found, unmatchable: false };

    const failures: LoggingFailure[] = [
        ...(read.error?.failures ?? []),
        ...(unmatchableEntries? [{ source: 'TraceViewer', operation: 'read', message: 'Could not apply the entries filter or full-text search to every entry; those entries are left out.' } as const] : []),
        ...(unmatchableTraces? [{ source: 'TraceViewer', operation: 'read', message: 'Could not apply the results filter to every trace; those traces are left out.' } as const] : []),
    ];

    traces.sort((a, b) => a.timestamp-b.timestamp);
    return { ...resultFrom(failures), traces };

}


/**
 * Group entries by the trace they belong to (the `top_id` every span in a trace carries), keeping the store's
 * order within each trace. Entries outside any trace are left out.
 */
function groupByTrace<E extends LogEntry<any, SpanMeta>>(entries: E[]): Map<string, E[]> {
    const byTrace = new Map<string, E[]>();
    for( const entry of entries ) {
        const traceId = entry.meta?.span?.top_id;
        if( !traceId ) continue;
        const trace = byTrace.get(traceId);
        if( trace ) {
            trace.push(entry);
        } else {
            byTrace.set(traceId, [entry]);
        }
    }
    return byTrace;
}


/**
 * Keep the items `matches` accepts. An item it throws on is left out, since whether it matches is unknown.
 *
 * @returns The kept items, and whether `matches` threw on any item.
 */
function keepMatching<I>(items: I[], matches: (item: I) => boolean): { kept: I[], unmatchable: boolean } {
    let unmatchable = false;
    const kept = items.filter(item => {
        try {
            return matches(item);
        } catch {
            unmatchable = true;
            return false;
        }
    });
    return { kept, unmatchable };
}
