import { matchJavascriptObject, type WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { ILogStorage, LogEntry } from "../../log-storage/types.ts";
import type { MinimumContext } from "../../types.ts";
import type { TraceEntryFilter, TraceFilter, TraceSearchResult, TraceSearchResults } from "./types.ts";
import type { SpanMeta } from "../types.ts";





/**
 * Retrieve traces and all their entries
 * @param rawLogger The storage of the entries
 * @param filter Filter the traces
 * @returns An array of trace objects; sorted by timestamp asc; each with an id, timestamp and containing an array of all entries in the trace (and an optional 'matches' list of entries just matching the traceEntryFilter)
 */
export async function getTraces<T extends MinimumContext = any>(rawLogger:ILogStorage, filter?: TraceFilter<T>, includeAllTraceEntries = true): Promise<TraceSearchResults<T>> {
    if( includeAllTraceEntries===undefined ) includeAllTraceEntries = true;

    

    // Lock results to just span entries in the log 
    const lockedTraceEntryFilter:TraceEntryFilter = filter?.entries_filter? {...filter.entries_filter, 'meta.type': 'span'} : {'meta.type': 'span'};
    

    // Find all matching items for the filter
    const matches = await rawLogger.get(lockedTraceEntryFilter, filter?.entries_full_text_search);
    // TODO Filter to span entries only (as it's as LogEntry<T, SpanMeta>)

    // Extract trace ids: 
    const traceEntries:Record<string, TraceSearchResult<T>> = {};
    for( const entry of matches ) {
        const spanId = entry.meta?.span?.top_id;
        if( spanId && !traceEntries[spanId] ) {
            traceEntries[spanId] = {id: '', timestamp: -1, logs: [], matches: []};
            if( filter?.entries_filter || filter?.entries_full_text_search ) {
                // Record filter matches
                traceEntries[spanId].matches.push(entry);
            }
        }
    }

    // Find all entries for each trace
    if( includeAllTraceEntries ) {
        const tracesFilter:WhereFilterDefinition<LogEntry<any, SpanMeta>> = {
            OR: Object.keys(traceEntries).map(x => ({
                'meta.span.top_id': x
            }))
        }

        // Add each entry to its corresponding trace results object, in the 'all' array 
        const allTracesEntries = await rawLogger.get(tracesFilter) as LogEntry<any, SpanMeta>[];
        for( const entry of allTracesEntries ) {
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
    if( filter?.results_filter ) {
        for( const key in traceEntries ) {
            if( !matchJavascriptObject(traceEntries[key]!, filter.results_filter) ) {
                delete traceEntries[key];
            }
        }
    }

    return Object.values(traceEntries).sort((a, b) => a.timestamp-b.timestamp);

}

type CommonTraceName = 'has_error';
export async function getCommonTraces(rawLogger:ILogStorage, traceName: CommonTraceName):Promise<TraceSearchResults> {
    let filter:WhereFilterDefinition<LogEntry> | undefined;
    switch(traceName) {
        case 'has_error':
            filter = {
                'type': 'error'
            }
            break;
        default:
            const _exhaustiveCheck:never = traceName;
            _exhaustiveCheck satisfies never;
            break;
    }

    if( filter ) {
        return await getTraces(rawLogger, {entries_filter: filter}) as TraceSearchResults;
    } else {
        throw new Error("Unknown common name");
    }

}