import type { WhereFilterDefinition } from "@andyrmitchell/objects";
import type { IRawLogger, LogEntry } from "../raw-storage/types.ts";
import type { SpanContext } from "./types.ts";
import type { MinimumContext } from "../types.ts";

type TraceEntries<T extends MinimumContext = MinimumContext> = Record<string, LogEntry<T, SpanContext>[]>;

/**
 * Retrieve all entries for traces that have at least one entry matching the criteria.
 * @param rawLogger The storage of the entries
 * @param filter 
 * @returns A record, with trace ids as the key, containing an array of all entries 
 */
export async function getTraces<T extends MinimumContext = any>(rawLogger:IRawLogger<any, any>, filter?:WhereFilterDefinition<LogEntry<T, SpanContext>>): Promise<TraceEntries<T>> {

    const typedRawLogger = rawLogger as IRawLogger<{}, SpanContext>

    // Find all matching items for the filter
    const matches = await typedRawLogger.get(filter);

    // Extract trace ids: 
    const traceEntries:TraceEntries<T> = {};
    for( const entry of matches ) {
        const traceId = entry.meta?.trace.id;
        if( traceId && !traceEntries[traceId] ) {
            traceEntries[traceId] = [];
        }
    }

    // Find all entries for each trace
    const traceFilter:WhereFilterDefinition<LogEntry<{}, SpanContext>> = {
        OR: Object.keys(traceEntries).map(x => ({
            'meta.trace.id': x
        }))
    }

    // Add each entry to its corresponding trace array 
    const allTracesEntries = await typedRawLogger.get(traceFilter);
    for( const entry of allTracesEntries ) {
        const traceId = entry.meta?.trace.id;
        const entries = traceId && traceEntries[traceId];
        if( entries ) {
            entries.push(entry as LogEntry<T, SpanContext>);
        }
    }

    return traceEntries;

}

type CommonTraceName = 'has_error';
export async function getCommonTraces<T extends MinimumContext = MinimumContext>(rawLogger:IRawLogger<any, SpanContext>, traceName: CommonTraceName):Promise<TraceEntries<T>> {
    let filter:WhereFilterDefinition<LogEntry<any, SpanContext>> | undefined;
    switch(traceName) {
        case 'has_error':
            filter = {
                'type': 'error'
            }
            break;
        default:
            
            break;
    }

    if( filter ) {
        return await getTraces(rawLogger, filter) as TraceEntries<T>;
    } else {
        throw new Error("Unknown common name");
    }

}