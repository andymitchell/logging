import {  useCallback, useMemo, useState } from "react";


import type { TracesSource } from "./types.ts";
import type { BaseComponentTypes } from "../types.ts";


import styles from './TraceInspector.module.css';
import { TraceSelectAndView } from "./TraceSelectAndView.tsx";





type TraceInspectorProps = BaseComponentTypes & {


    /**
     * Either a TraceViewer object or a GetTracesFn
     */
    tracesSource: TracesSource;

    template?: 'neutral'
}


type Pane = 'list' | 'search';

export const TraceInspector: React.FC<TraceInspectorProps> = (props) => {

    const className = useMemo(() => {
        let className = `${props.className ?? ''}`
        if( props.template==='neutral' ) {
            className += ` ${styles.neutral}`
        }
        return className;
    }, [props.className, props.template]);

    const style:React.CSSProperties = {
        display: 'flex',
        flexDirection: 'row',
        verticalAlign: 'top',
        ...props.style,
    }
    
    const [pane, setPane] = useState<Pane>('search');


    return (
        <div ref={props.ref} className={className} style={style}>

            <nav>
            
                <div onClick={useCallback(() => setPane('search'), [])}>
                    <span>Search</span>
                </div>
                <div onClick={useCallback(() => setPane('list'), [])}>
                    <span>List</span>
                </div>
            
            </nav>

            <main>
                {pane==='search' && (
                    <div data-container='search-pane'>
                        <TraceSelectAndView tracesSource={props.tracesSource} selector={'search'} />
                    </div>
                )}

                {pane==='list' && (
                    <div data-container='list-pane'>
                        <TraceSelectAndView tracesSource={props.tracesSource} selector={'list'} />
                    </div>
                )}
            </main>

            
        </div>
    );
};

