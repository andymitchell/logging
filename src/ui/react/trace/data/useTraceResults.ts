import type {  TracesSource } from "../types.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { TraceViewer } from "../../../../trace/viewing/TraceViewer.ts";
import type { TraceFilter, TraceSearchResults } from "../../../../trace/viewing/types.ts";


export function useTraceResults(
    source: TracesSource,
    query: TraceFilter,
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
                    data = await source.getTraces(query, includeAllTraceEntries);
                } else {
                    data = await source(query, includeAllTraceEntries);
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

    const traceFilter:TraceFilter = useMemo(() => {
        return {entries_filter: {
            'meta.span.top_id': traceId
        }};
    }, [traceId])

    const { data, loading, error } = useTraceResults(source, traceFilter);

    const result = useMemo(() => {
        const trace = data? data[0] : undefined;
        return {trace, loading, error};
    }, [data, loading, error])

    return result;

}