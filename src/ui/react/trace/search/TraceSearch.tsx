
import { useMemo } from "react";
import { useTraceResults } from "../data/useTraceResults.ts";
import type { TracesSource } from "../types.ts";
import { TraceSearchResultsList } from "./TraceSearchResultsList.tsx";
import type { TraceFilter } from "../../../../trace/viewing/types.ts";

interface TraceSearchProps {
    /**
     * Either a TraceViewer object or a GetTracesFn
     */
    tracesSource: TracesSource;
    query: TraceFilter,
    onClick?: (traceId:string) => void;
}


export const TraceSearch: React.FC<TraceSearchProps> = ({
    tracesSource,
    query,
    onClick
}) => {
    
    const { data, loading, error } = useTraceResults(tracesSource, query, false);

    const entries = useMemo(() => {
        if( data ) {
            
            return data.flatMap(x => x.matches);
        } else {
            return [];
        }
    }, [data]);
    

    return (
        <div>
            
            {loading && <div>Loading...</div>}
            {error && <div>Error: {error.message}</div>}

            <TraceSearchResultsList entries={entries} onClick={onClick}/>
            
            
        </div>
    );

};