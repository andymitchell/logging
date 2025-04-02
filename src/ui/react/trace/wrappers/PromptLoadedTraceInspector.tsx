import { useCallback, useState } from "react";
import type { BaseComponentTypes } from "../../types.ts";
import { TraceInspector } from "../TraceInspector.tsx";
import type { TracesSource } from "../types.ts";
import { isTraceResult } from "../../../../trace/types.ts";
import { isLogEntrySimple, type LogEntry } from "../../../../raw-storage/types.ts";
import { MemoryLogger } from "../../../../raw-storage/memory/MemoryLogger.ts";
import { TraceViewer } from "../../../../index-get-traces.ts";
import { monotonicFactory } from "ulid";


type TraceInspectorProps = BaseComponentTypes & {



    template?: 'neutral'
}


export const PromptLoadedTraceInspector: React.FC<TraceInspectorProps> = (props) => {

    //TracesSource

    const [tracesSource, setTracesSources] = useState<TracesSource | undefined>();

    const onClickLoad = useCallback(() => {
        const json = prompt("Enter json of an array of log entries or a TraceResults:");
        if( !json ) return;

        let obj:object;
        try {
            obj = JSON.parse(json);
        } catch(e) {
            alert("Could not parse json.");
            throw e;
        }

        let entries:LogEntry[] | undefined;
        if( Array.isArray(obj) ) {
            if( obj.every(isTraceResult) ) {
                // Flatten it down to its entries
                entries = obj.flatMap(x => x.logs);
            } else if( obj.every(isLogEntrySimple) ) {
                entries = obj;
            } else if( "all" in obj[0] ) {
                // Older format previously used 
                // Flatten it down to entries
                let all = obj.flatMap(x => x.all);

                const entriesMap:Record<string, any> = {};
                all.forEach(x => entriesMap[x.id] = x);
                all = Object.values(entriesMap);

                all = all.sort((a,b) => a.timestamp-b.timestamp);
                
                
                const ulid = monotonicFactory();
                if( all.every(x => typeof x==='object' && x!==null && "type" in x) ) {
                    entries = all.map(x => {
                        if( x.meta?.trace ) {
                            x.meta.span = x.meta.trace;
                        }
                        x.ulid = ulid();
                        if( !x.message && x.meta.name ) {
                            x.message = x.meta.name;
                        }
                        return x;
                    });
                } else {
                    alert("Expected array of log entries");
                }
            }
        } else {
            alert("Expected array");
        }
        
        if( entries ) {
            const logger = new MemoryLogger('');
            logger.load(entries);
            const viewer = new TraceViewer(logger);

            console.log("Loaded entries", entries);
            setTracesSources(viewer);
        }
    }, [])

    return (
        <div>
            <button onClick={onClickLoad}>Load</button>
            {tracesSource && 
            (<TraceInspector 
            tracesSource={tracesSource}
            template={props.template}
            />)
            }
        </div>
    )
}