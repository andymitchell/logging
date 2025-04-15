import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertLogToTree, type BaseComponentTypes, type TLog, type TLogBody, type TSpan } from "../../types.ts";

import { JsonView, allExpanded, defaultStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';

import type { TracesSource } from "../types.ts";

import { useTrace } from "../data/useTraceResults.ts";


type TraceViewProps = BaseComponentTypes & {
    traceId: string,

    /**
     * Either a TraceViewer object or a GetTracesFn
     */
    tracesSource: TracesSource
}


type OnClickLog = (id:string) => void;


export const TraceView: React.FC<TraceViewProps> = (props) => {

    
    const data = useTrace(props.tracesSource, props.traceId);
    
    const topSpan = useMemo(() => {
        const entries = data.trace?.logs;
        if (!entries) return;



        const newF = convertLogToTree(entries);
        

        return newF;
    }, [data.trace])

    const [logIdForDetails, setLogIdForDetails] = useState<string | undefined>(undefined);
    const logDetails = useMemo(() => {
        return data.trace?.logs.find(x => x.ulid===logIdForDetails);
    }, [data.trace, logIdForDetails]);

    const onClickLog = useCallback((id: string) => {
        console.log("Clicked "+id )
        setLogIdForDetails(id);
    }, [])

    return (
        <div ref={props.ref} className={props.className} style={props.style} data-container='trace-viewer' data-trace-id={data.trace?.id}>
            <div>
                {topSpan && (<Span span={topSpan} onClickLog={onClickLog} />)}
            </div>
            <div style={{display: logDetails? 'block' : 'none'}}>
                Viewing {logDetails?.ulid}

                {logDetails && (
                    <JsonView data={logDetails} shouldExpandNode={allExpanded} style={defaultStyles} />
                )}
                
            </div>

        </div>

    )
}

type SpanOrLogProps = {
    item: TSpan | TLog;
    parentDepth?: number,
    onClickLog?:OnClickLog
}

const SpanOrLog: React.FC<SpanOrLogProps> = ({ item, parentDepth, onClickLog }) => {
    if (typeof parentDepth !== 'number') parentDepth = 0;
    if (item.type === 'log') {
        return (
            <Log item={item} parentDepth={parentDepth} onClickLog={onClickLog} />
        );
    } else {
        // For a span, use its own depth for indentation.
        return (
            <Span span={item} onClickLog={onClickLog} />
        );
    }
}

type LogBodyProps = {
    body: TLogBody
}
export const LogBody: React.FC<LogBodyProps> = ({ body }) => {
    return (<>
        {body.message} - {new Date(body.timestamp).toLocaleTimeString()}
    </>)
}


type LogProps = {
    item: TLog,
    parentDepth: number
    onClickLog?:OnClickLog
}
const Log: React.FC<LogProps> = ({ item, parentDepth, onClickLog }) => {

    const onClick = useCallback(() => {
        if( onClickLog ) onClickLog(item.id)
    }, [onClickLog, item])

    return (
        <div
            key={item.id}
            data-id={item.id}
            style={{ marginLeft: `${parentDepth * 20}px` }}
            data-container='log'
            onClick={onClick}
        >
            <LogBody body={item.body} />
        </div>
    );
}


type SpanProps = {
    span: TSpan,
    scrollToId?: string,
    onClickLog?:OnClickLog
}
const Span: React.FC<SpanProps> = ({ span, scrollToId, onClickLog }) => {

    const [minimised, setMinimised] = useState<boolean>(false);

    const toggleMinimised = useCallback(() => {
        setMinimised(!minimised);
    }, [minimised]);

    useScroll(scrollToId);

    const onClick = useCallback(() => {
        if( onClickLog ) onClickLog(span.ulid)
    }, [onClickLog, span])


    return (
        <div key={span.id} data-type='span' data-id={span.id} data-container='span'>

            <div style={{ marginLeft: `${span.depth * 20}px` }}>
                <div style={{ display: 'inline-block', width: '20px' }} onClick={toggleMinimised}>{minimised ? '+' : '-'}</div>
                <strong onClick={onClick}>
                    <LogBody body={span.body} />
                </strong>
            </div>

            {!minimised &&
                (<div key={`span_children_${span.id}`} data-type='span-children'>
                    {span.children.map(child => (<SpanOrLog key={child.id} item={child} parentDepth={span.depth + 1} onClickLog={onClickLog} />))}
                </div>)
            }
        </div>
    )
}

/**
 * Hook to scroll an element into view
 * 
 * @param targetId 
 * @param ready The elements are fully loaded and ready to be scrolled
 */
function useScroll(targetId?: string, ready = true) {
    // This ref will ensure we only scroll once.
    const hasScrolledRef = useRef(false);

    useEffect(() => {
        // Only run if we haven't scrolled yet, is ready, and a targetId is provided.
        if (!hasScrolledRef.current && ready && targetId) {
            const element = document.querySelector(`[data-id='${targetId}']`);
            if (element) {
                // Scroll smoothly to the element.
                element.scrollIntoView({ behavior: 'smooth' });
                // Mark as scrolled so this effect doesn't run again.
                hasScrolledRef.current = true;
            }
        }
    }, [targetId, ready])

}