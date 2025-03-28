import {  useCallback, useMemo, useState } from "react";


import type { TracesSource } from "./types.ts";
import type { BaseComponentTypes } from "../types.ts";
import { TraceFilteredSearchResults } from "./TraceFilteredSearchResults.tsx";
import { TraceView } from "./TraceView.tsx";
import styles from './TraceSearch.module.css';




type TraceSearchProps = BaseComponentTypes & {


    /**
     * Either a TraceViewer object or a GetTracesFn
     */
    tracesSource: TracesSource;

    template?: 'neutral'
}


export const TraceSearch: React.FC<TraceSearchProps> = (props) => {

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
                <TraceFilteredSearchResults tracesSource={props.tracesSource} onClick={onClickSearchResult} />
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

