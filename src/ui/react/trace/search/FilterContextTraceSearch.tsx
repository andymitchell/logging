
import type { TracesSource } from "../types.ts";

import { useFilterContext } from "../filter-bar/FilterContext.tsx";
import { TraceSearch } from "./TraceSearch.tsx";

interface FilterContextTraceSearchProps {
    /**
     * Either a TraceViewer object or a GetTracesFn
     */
    tracesSource: TracesSource;
    onClick?: (traceId:string) => void;
}


export const FilterContextTraceSearch: React.FC<FilterContextTraceSearchProps> = ({
    tracesSource,
    onClick
}) => {
    
    const {filter} = useFilterContext();

    return (
        <div>

            {filter && 
            (<TraceSearch tracesSource={tracesSource} query={filter} onClick={onClick}/>)
            }
            
            
        </div>
    );

};