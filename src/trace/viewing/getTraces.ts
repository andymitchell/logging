import { matchJavascriptObject, type WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { ILogStorage, LogEntry } from "../../log-storage/types.ts";
import type { MinimumContext } from "../../types.ts";
import type { GetTracesResult, TraceEntryFilter, TraceFilter, TraceResultFilter, TraceSearchResult } from "./types.ts";
import type { SpanMeta } from "../types.ts";
import type { LoggingFailure } from "../../failures/types.ts";
import { failed, resultFrom } from "../../failures/results.ts";
import { guardedRead } from "../../failures/guardedCalls.ts";





/**
 * Retrieve traces and all their entries.
 *
 * Reads the store once to find the matching traces, then once more for all their entries. Every failure is
 * passed on in the result, alongside the traces that could still be assembled; nothing throws or rejects.
 *
 * @param rawLogger The storage of the entries
 * @param filter Filter the traces
 * @returns The traces, sorted by timestamp asc; each with an id, timestamp and containing an array of all
 * entries in the trace (and an optional 'matches' list of entries just matching the traceEntryFilter).
 * `ok` is `false` if either read failed or `results_filter` could not be applied to a trace (that trace is
 * left out); a failure both reads hit is listed once.
 */
export async function getTraces<T extends MinimumContext = any>(rawLogger:ILogStorage, filter?: TraceFilter<T>, includeAllTraceEntries = true): Promise<GetTracesResult<T>> {
    try {
        return await searchTraces(rawLogger, filter, includeAllTraceEntries);
    } catch {
        // Every read is guarded, so only a bug in assembling the traces reaches here.
        return { ...failed({ source: 'TraceViewer', operation: 'unexpected', message: 'Could not assemble the traces from the entries read.' }), traces: [] };
    }
}


async function searchTraces<T extends MinimumContext = any>(rawLogger:ILogStorage, filter: TraceFilter<T> | undefined, includeAllTraceEntries: boolean): Promise<GetTracesResult<T>> {

    // Lock results to just span entries in the log
    const lockedTraceEntryFilter:TraceEntryFilter = filter?.entries_filter? {...filter.entries_filter, 'meta.type': 'span'} : {'meta.type': 'span'};


    // Find all matching items for the filter
    const matches = await guardedRead(rawLogger, 'TraceViewer', () => rawLogger.get<LogEntry<any, SpanMeta>>(lockedTraceEntryFilter, filter?.entries_full_text_search));

    // Extract trace ids:
    const traceEntries:Record<string, TraceSearchResult<T>> = {};
    for( const entry of matches.entries ) {
        const spanId = entry.meta?.span?.top_id;
        if( spanId && !traceEntries[spanId] ) {
            traceEntries[spanId] = {id: '', timestamp: -1, logs: [], matches: []};
            if( filter?.entries_filter || filter?.entries_full_text_search ) {
                // Record filter matches
                traceEntries[spanId].matches.push(entry);
            }
        }
    }

    // Find all entries for each trace (there is nothing to fill when no trace matched)
    const traceIds = Object.keys(traceEntries);
    let allTracesFailures: LoggingFailure[] = [];
    if( includeAllTraceEntries && traceIds.length>0 ) {
        const tracesFilter:WhereFilterDefinition<LogEntry<any, SpanMeta>> = {
            $or: traceIds.map(x => ({
                'meta.span.top_id': x
            }))
        }

        // Add each entry to its corresponding trace results object, in the 'all' array
        const allTracesEntries = await guardedRead(rawLogger, 'TraceViewer', () => rawLogger.get(tracesFilter));
        allTracesFailures = allTracesEntries.error?.failures ?? [];
        for( const entry of allTracesEntries.entries ) {
            const spanId = entry.meta?.span?.top_id;
            const entries = spanId && traceEntries[spanId];
            if( entries ) {
                entries.logs.push(entry);


                if( !entries.id && entry.meta?.span?.id ) {
                    // Set the top level data
                    entries.id = entry.meta?.span.id;
                    entries.timestamp = entry.timestamp;
                }
            }
        }
    }

    // Filter the final results
    const filterFailures = filter?.results_filter? removeUnmatchedTraces(traceEntries, filter.results_filter) : [];

    const matchesFailures = matches.error?.failures ?? [];
    const failures = [
        ...matchesFailures,
        // Both reads ask the same store, so a broken source usually fails both: one failure, not two.
        ...allTracesFailures.filter(failure => !matchesFailures.some(listed => JSON.stringify(listed)===JSON.stringify(failure))),
        ...filterFailures,
    ];

    const traces = Object.values(traceEntries).sort((a, b) => a.timestamp-b.timestamp);
    return { ...resultFrom(failures), traces };

}


/**
 * Delete every trace that does not match `resultsFilter`, including any it cannot be matched against.
 *
 * @returns A `read` failure if matching threw for any trace, else none.
 */
function removeUnmatchedTraces<T extends MinimumContext>(traceEntries: Record<string, TraceSearchResult<T>>, resultsFilter: TraceResultFilter<T>): LoggingFailure[] {
    let unfilterable = false;
    for( const key in traceEntries ) {
        try {
            if( !matchJavascriptObject(traceEntries[key]!, resultsFilter) ) {
                delete traceEntries[key];
            }
        } catch {
            // Whether it matches is unknown, so it is not presented as a match.
            delete traceEntries[key];
            unfilterable = true;
        }
    }
    return unfilterable? [{ source: 'TraceViewer', operation: 'read', message: 'Could not apply the results filter to every trace; those traces are left out.' }] : [];
}
