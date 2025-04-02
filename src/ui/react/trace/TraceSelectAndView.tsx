import {  useCallback, useMemo, useState } from "react";


import type { TracesSource } from "./types.ts";
import type { BaseComponentTypes } from "../types.ts";

import { TraceView } from "./viewer/TraceView.tsx";
import { FilterContextTraceSearch } from "./search/FilterContextTraceSearch.tsx";
import { TraceFilter } from "./filter-bar/TraceFilter.tsx";
import { FilterProvider } from "./filter-bar/FilterContext.tsx";
import { TraceList } from "./list/TraceList.tsx";




type TraceSelectAndViewProps = BaseComponentTypes & {


    /**
     * Either a TraceViewer object or a GetTracesFn
     */
    tracesSource: TracesSource;

    selector: 'search' | 'list',

}


export const TraceSelectAndView: React.FC<TraceSelectAndViewProps> = (props) => {


    const [traceId, setTraceId] = useState<string | undefined>();

    const selectorCss:React.CSSProperties = useMemo(() => {
        return {
            display: traceId? 'none' : 'block'
        }
    }, [traceId]);

    const onClickTraceRow = useCallback((traceId:string) => {
        setTraceId(traceId);
    }, []);

    const onClickBack = useCallback(() => {
        setTraceId(undefined);
    }, []);
    

    return (
        <div ref={props.ref} className={props.className} style={props.style} data-container='search-and-view'>

        
            <div style={selectorCss}>
                {props.selector==='search' && 
                (
                    <FilterProvider 
                        initializedCriteria={{type: 'debounce'}} 
                                        
                    >
                        <TraceFilter  />
                        <FilterContextTraceSearch tracesSource={props.tracesSource} onClick={onClickTraceRow} />
                    </FilterProvider>
                )}
                {props.selector==='list' && 
                (
                    <TraceList tracesSource={props.tracesSource} onClick={onClickTraceRow}/>
                )}
            </div>

            {traceId && (
                <>
                    <button onClick={onClickBack}>Back</button>
                    <TraceView traceId={traceId} tracesSource={props.tracesSource} />
                </>
            )}
        

            
            
        </div>
    );
};

