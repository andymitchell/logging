import { matchJavascriptObject, type WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { IRawLogger, LogEntry } from "../../raw-storage/types.ts";
import type { SpanMeta,  TraceSearchResult,  TraceSearchResults } from "../types.ts";
import type { MinimumContext } from "../../types.ts";
import type { TraceEntryFilter, TraceFilter } from "./types.ts";





/**
 * Retrieve traces and all their entries
 * @param rawLogger The storage of the entries
 * @param traceEntryFilter Optional. At least one entry in the trace must match this filter for the trace to be included.
 * @param traceResultFilter Optional. Filter the final trace results (e.g. timestamp).
 * @returns An array of trace objects; sorted by timestamp asc; each with an id, timestamp and containing an array of all entries in the trace (and an optional 'matches' list of entries just matching the traceEntryFilter)
 */
export async function getTraces<T extends MinimumContext = any>(rawLogger:IRawLogger<any, any>, filter?: TraceFilter<T>, includeAllTraceEntries = true): Promise<TraceSearchResults<T>> {
    if( includeAllTraceEntries===undefined ) includeAllTraceEntries = true;

    const typedRawLogger = rawLogger as IRawLogger<{}, SpanMeta>

    // Lock results to just span entries in the log 
    const lockedTraceEntryFilter:TraceEntryFilter = filter?.entries? {...filter.entries, 'meta.type': 'span'} : {'meta.type': 'span'};
    

    // Find all matching items for the filter
    const matches = await typedRawLogger.get(lockedTraceEntryFilter, filter?.entries_full_text);
    // TODO Filter to span entries only (as it's as LogEntry<T, SpanMeta>)

    // Extract trace ids: 
    const traceEntries:Record<string, TraceSearchResult<T>> = {};
    for( const entry of matches ) {
        const spanId = entry.meta?.span.top_id;
        if( spanId && !traceEntries[spanId] ) {
            traceEntries[spanId] = {id: '', timestamp: -1, logs: [], matches: []};
            if( filter?.entries || filter?.entries_full_text ) {
                // Record filter matches
                traceEntries[spanId].matches.push(entry as LogEntry<T, SpanMeta>);
            }
        }
    }

    // Find all entries for each trace
    if( includeAllTraceEntries ) {
        const tracesFilter:WhereFilterDefinition<LogEntry<{}, SpanMeta>> = {
            OR: Object.keys(traceEntries).map(x => ({
                'meta.span.top_id': x
            }))
        }

        // Add each entry to its corresponding trace results object, in the 'all' array 
        const allTracesEntries = await typedRawLogger.get(tracesFilter);
        for( const entry of allTracesEntries ) {
            const spanId = entry.meta?.span.top_id;
            const entries = spanId && traceEntries[spanId];
            if( entries ) {
                entries.logs.push(entry as LogEntry<T, SpanMeta>);

                
                if( !entries.id && entry.meta?.span.id ) {
                    // Set the top level data
                    entries.id = entry.meta?.span.id;
                    entries.timestamp = entry.timestamp;
                }
            }
        }
    }

    // Filter the final results
    if( filter?.results ) {
        for( const key in traceEntries ) {
            if( !matchJavascriptObject(traceEntries[key]!, filter.results) ) {
                delete traceEntries[key];
            }
        }
    }

    return Object.values(traceEntries).sort((a, b) => a.timestamp-b.timestamp);

}

type CommonTraceName = 'has_error';
export async function getCommonTraces<T extends MinimumContext = MinimumContext>(rawLogger:IRawLogger<any, SpanMeta>, traceName: CommonTraceName):Promise<TraceSearchResults<T>> {
    let filter:WhereFilterDefinition<LogEntry<any, SpanMeta>> | undefined;
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
        return await getTraces(rawLogger, {entries: filter}) as TraceSearchResults<T>;
    } else {
        throw new Error("Unknown common name");
    }

}