import { useCallback, useMemo} from "react";

import { convertLogSpanEntryToBody } from "../../types.ts";
import type { LogEntry } from "../../../../log-storage/types.ts";
import type { SpanMeta, TraceEntry } from "../../../../trace/types.ts";
import { LogBody } from "../common-components/LogBody.tsx";






interface TraceSearchResultsListProps {
    entries: TraceEntry<any>[];
    onClick?: (traceId:string) => void;
}


export const TraceSearchResultsList: React.FC<TraceSearchResultsListProps> = ({
    entries,
    onClick
}) => {
    

    return (
        <div data-container='trace-results'>
            {entries.map(entry => (<Row key={entry.ulid} entry={entry} onClick={onClick} />))}
            
        </div>
    );
};


type RowProps = {
    entry:LogEntry<any, SpanMeta>,
    onClick?: (traceId:string) => void;
}
const Row: React.FC<RowProps> = ({
    entry,
    onClick
}) => {

    
    const body = useMemo(() => {
        return convertLogSpanEntryToBody(entry)
    }, [entry])

    const onClickWrapped = useCallback(() => {
        const traceId = entry.meta?.span?.top_id;
        if( onClick ) {
            if( !traceId ) throw new Error("Expect trace id");
            onClick(traceId);
        }
    }, [entry])

    return (
        <div onClick={onClickWrapped} data-container='row' style={{marginTop: '5px'}}>
            <LogBody body={body} />
        </div>
    );
};

