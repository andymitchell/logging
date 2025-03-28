import { MemoryLogger } from "../../../../raw-storage/memory/MemoryLogger.ts";
import { Trace } from "../../../../trace/Trace.ts";
import { TraceViewer } from "../../../../trace/viewing/TraceViewer.ts";
import type { GetTracesFn } from "../types.ts";

export const generateTestLogFetch:(() => GetTracesFn) = () => {
    const logger = new MemoryLogger('');

    // Initialise some events:
    const trace = new Trace<any>(logger, 'T0', { 'name': 'Bob' });
    trace.log("First moment", { name: 'Sue' });
    const span1 = trace.startSpan('T1', { color: 'blue' });
    span1.error("Oh jeez no!");
    trace.log("Well that was that");

    const testLogFetch:GetTracesFn = async (traceEntryFilter?, traceResultFilter?, includeAllTraceEntries?) => {
        

        const viewer = new TraceViewer(logger);
        const result = await viewer.getTraces(traceEntryFilter, traceResultFilter, includeAllTraceEntries);

        console.log("testLogFetch got result", {traceEntryFilter, result});
        return result;
    }

    return testLogFetch;

    /*
    const entries = await logger.get() as LogEntry<any, SpanMeta>[];

    // TODO Should it return a specific trace? No, it's a search. Ah this is about the results, which are clicked into. 
    return entries;
    */
}