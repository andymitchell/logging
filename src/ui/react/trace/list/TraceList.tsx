import { useCallback, useEffect, useMemo, useState} from "react";

import { convertLogSpanEntryToBody } from "../../types.ts";
import type { TraceResult, TraceSearchResults } from "../../../../trace/viewing/types.ts";
import { LogBody } from "../viewer/TraceView.tsx";
import type { TracesSource } from "../types.ts";
import { TraceViewer } from "../../../../index-get-traces.ts";





interface TraceListProps {
    /**
     * Either a TraceViewer object or a GetTracesFn
     */
    tracesSource: TracesSource;
    onClick?: (traceId:string) => void;
}


export const TraceList: React.FC<TraceListProps> = ({
    tracesSource,
    onClick
}) => {
    

    const [traces, setTraces] = useState<TraceSearchResults>([]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            let newEntries:TraceSearchResults;

            if( tracesSource instanceof TraceViewer ) {
                newEntries = await tracesSource.getTraces();
            } else {
                newEntries = await tracesSource();
            }

            if( cancelled ) return;
            setTraces(newEntries);

        })();
        return () => {
            cancelled = true;
        }
    }, [tracesSource]);

    return (
        <div data-container='traces-list'>
            {traces.map(trace => (<Row key={trace.id} trace={trace} onClick={onClick} />))}
            
        </div>
    );
};


type RowProps = {
    trace:TraceResult,
    onClick?: (traceId:string) => void;
}
const Row: React.FC<RowProps> = ({
    trace,
    onClick
}) => {

    
    const body = useMemo(() => {
        const logEntry = trace.logs[0];
        return logEntry? convertLogSpanEntryToBody(logEntry) : undefined;
    }, [trace])

    const onClickWrapped = useCallback(() => {
        const traceId = trace.id;
        if( onClick ) {
            if( !traceId ) throw new Error("Expect trace id");
            onClick(traceId);
        }
    }, [trace]);

    return (
        <div onClick={onClickWrapped} data-container='row'>
            {body && (<LogBody body={body} />) }
        </div>
    );
};

