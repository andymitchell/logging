import {  useCallback, useMemo, useState } from "react";


import type { TracesSource } from "./types.ts";
import type { BaseComponentTypes } from "../types.ts";

import { TraceView } from "./viewer/TraceView.tsx";
import styles from './TraceInspector.module.css';
import { FilterContextTraceSearch } from "./search/FilterContextTraceSearch.tsx";
import { TraceFilter } from "./filter-bar/TraceFilter.tsx";
import { FilterProvider } from "./filter-bar/FilterContext.tsx";




type TraceInspectorProps = BaseComponentTypes & {


    /**
     * Either a TraceViewer object or a GetTracesFn
     */
    tracesSource: TracesSource;

    template?: 'neutral'
}


export const TraceInspector: React.FC<TraceInspectorProps> = (props) => {

    const className = useMemo(() => {
        let className = `${props.className ?? ''}`
        if( props.template==='neutral' ) {
            className += ` ${styles.neutral}`
        }
        return className;
    }, [props.className, props.template]);

    const [traceId, setTraceId] = useState<string | undefined>();

    const searchStyle:React.CSSProperties = useMemo(() => {
        return {
            display: traceId? 'none' : 'block'
        }
    }, [traceId]);

    const onClickSearchResult = useCallback((traceId:string) => {
        setTraceId(traceId);
    }, []);

    const onClickBack = useCallback(() => {
        setTraceId(undefined);
    }, []);
    

    return (
        <div ref={props.ref} className={className} style={props.style}>

            <div style={searchStyle}>
                <FilterProvider 
                    initializedCriteria={{type: 'debounce'}} 
                                      
                >
                    <TraceFilter  />
                    <FilterContextTraceSearch tracesSource={props.tracesSource} onClick={onClickSearchResult} />
                </FilterProvider>
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

