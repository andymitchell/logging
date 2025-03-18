import { matchJavascriptObject, type WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { IRawLogger, LogEntry } from "../../raw-storage/types.ts";
import type { SpanMeta,  TraceResults } from "../types.ts";
import type { MinimumContext } from "../../types.ts";
import type { TraceEntryFilter, TraceResultFilter } from "./types.ts";


/**
 * Retrieve traces and all their entries
 * @param rawLogger The storage of the entries
 * @param traceEntryFilter Optional. At least one entry in the trace must match this filter for the trace to be included.
 * @param traceResultFilter Optional. Filter the final trace results (e.g. timestamp).
 * @returns A record, with trace ids as the key, containing an array of all entries in the trace (and an optional 'matches' list of entries just matching the traceEntryFilter)
 */
export async function getTraces<T extends MinimumContext = any>(rawLogger:IRawLogger<any, any>, traceEntryFilter?:TraceEntryFilter<T>, traceResultFilter?: TraceResultFilter<T>): Promise<TraceResults<T>> {

    const typedRawLogger = rawLogger as IRawLogger<{}, SpanMeta>

    // Lock results to just span entries in the log 
    const lockedTraceEntryFilter:TraceEntryFilter = traceEntryFilter? {...traceEntryFilter, 'meta.type': 'span'} : {'meta.type': 'span'};
    

    // Find all matching items for the filter
    const matches = await typedRawLogger.get(lockedTraceEntryFilter);
    // TODO Filter to span entries only (as it's as LogEntry<T, SpanMeta>)

    // Extract trace ids: 
    const traceEntries:TraceResults<T> = {};
    for( const entry of matches ) {
        const traceId = entry.meta?.trace.top_id;
        if( traceId && !traceEntries[traceId] ) {
            traceEntries[traceId] = {id: '', timestamp: -1, all: [], matches: []};
            if( traceEntryFilter ) {
                // Record filter matches
                traceEntries[traceId].matches.push(entry as LogEntry<T, SpanMeta>);
            }
        }
    }

    // Find all entries for each trace
    const tracesFilter:WhereFilterDefinition<LogEntry<{}, SpanMeta>> = {
        OR: Object.keys(traceEntries).map(x => ({
            'meta.trace.top_id': x
        }))
    }

    // Add each entry to its corresponding trace results object, in the 'all' array 
    const allTracesEntries = await typedRawLogger.get(tracesFilter);
    for( const entry of allTracesEntries ) {
        const traceId = entry.meta?.trace.top_id;
        const entries = traceId && traceEntries[traceId];
        if( entries ) {
            entries.all.push(entry as LogEntry<T, SpanMeta>);

            
            if( !entries.id && entry.meta?.trace.id ) {
                // Set the top level data
                entries.id = entry.meta?.trace.id;
                entries.timestamp = entry.timestamp;
            }
        }
    }

    // Filter the final results
    if( traceResultFilter ) {
        for( const key in traceEntries ) {
            if( !matchJavascriptObject(traceEntries[key]!, traceResultFilter) ) {
                delete traceEntries[key];
            }
        }
    }

    return traceEntries;

}

type CommonTraceName = 'has_error';
export async function getCommonTraces<T extends MinimumContext = MinimumContext>(rawLogger:IRawLogger<any, SpanMeta>, traceName: CommonTraceName):Promise<TraceResults<T>> {
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
        return await getTraces(rawLogger, filter) as TraceResults<T>;
    } else {
        throw new Error("Unknown common name");
    }

}