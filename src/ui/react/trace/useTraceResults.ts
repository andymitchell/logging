import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type {  TracesSource } from "./types.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TraceEntry, TraceSearchResults } from "../../../trace/types.ts";
import { TraceViewer } from "../../../trace/viewing/TraceViewer.ts";


export function useTraceResults(
    source: TracesSource,
    query: WhereFilterDefinition,
    includeAllTraceEntries?: boolean
) {
    const loadingIdRef = useRef(0);
    const [data, setData] = useState<TraceSearchResults | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);

        loadingIdRef.current++;
        const loadingId = loadingIdRef.current;

        (async () => {
            

            
            try {
                let data:TraceSearchResults<any>;
                if( source instanceof TraceViewer ) {
                    data = await source.getTraces({entries: query}, includeAllTraceEntries);
                } else {
                    data = await source({entries: query}, includeAllTraceEntries);
                }

                if( loadingIdRef.current!==loadingId ) return;
                setData(data);
            } catch(e) {
                if( e instanceof Error ) setError(e);
            } finally {
                setLoading(false);
            }
        })();

        
    }, [query, source]);

    return { data, loading, error };
}


/**
 * Convert a trace ID into a query, then return a single trace result 
 * @param traceId 
 * @param traceFetcher 
 * @returns 
 */
export function useTrace(

    source: TracesSource,
    traceId: string) {
    const traceQuery:WhereFilterDefinition<TraceEntry> = useMemo(() => {
        return {
            'meta.span.top_id': traceId
        }
    }, [traceId])

    const { data, loading, error } = useTraceResults(source, traceQuery);

    const result = useMemo(() => {
        const trace = data? data[0] : undefined;
        return {trace, loading, error};
    }, [data, loading, error])

    return result;

}