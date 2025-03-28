import {  useMemo, useState } from "react";

import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";



import { TraceSearchResults } from "./TraceSearchResults.tsx";
import { TraceSearchFilter } from "./TraceSearchFilter.tsx";
import { useTraceResults } from "./useTraceResults.ts";
import type { TracesSource } from "./types.ts";





interface TraceFilteredSearchResultsProps {


    /**
     * Either a TraceViewer object or a GetTracesFn
     */
    tracesSource: TracesSource;

    onClick?: (traceId:string) => void
}


export const TraceFilteredSearchResults: React.FC<TraceFilteredSearchResultsProps> = (props) => {
    
    
    
    const [query, setQuery] = useState<WhereFilterDefinition>({ message: '' });
    const { data, loading, error } = useTraceResults(props.tracesSource, query, false);

    const handleSearch = (filter: WhereFilterDefinition) => {
        setQuery(filter);
    };

    const entries = useMemo(() => {
        if( data ) {
            
            return data.flatMap(x => x.matches);
        } else {
            return [];
        }
    }, [data]);
    

    return (
        <div>
            
            <TraceSearchFilter onSearch={handleSearch} />

            
            {loading && <div>Loading...</div>}
            {error && <div>Error: {error.message}</div>}

            <TraceSearchResults entries={entries} onClick={props.onClick}/>
            
            
        </div>
    );
};

