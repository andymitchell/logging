import { MemoryLogger } from "../raw-storage/memory/MemoryLogger.ts";
import { getTraces } from "./getTraces.ts";
import { Trace } from "./Trace.ts";



it('', async () => {

    const rawLogger = new MemoryLogger('');

    const trace1 = new Trace(rawLogger);
    trace1.log('abc1');
    
    const traces = await getTraces(rawLogger);
    
    const id = trace1.getId();
    const traceIds = Object.keys(traces);
    const traceId1 = traceIds[0]!;
    console.log({id, idLength: id.length, traceId1, traceId1length: traceId1.length});
    expect(id).toBe(traceId1);
    console.log({id});
    console.log(traces);
    console.log(traces[id]);
    expect(traces[trace1.getId()]).toBeDefined();
    expect(traces[trace1.getId()]?.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
    


})

it('', async () => {

    const rawLogger = new MemoryLogger('');

    const trace1 = new Trace(rawLogger);
    trace1.log('abc1');
    
    const trace2 = new Trace(rawLogger);
    trace2.log('def');



})

// Ignores second trace
// Get across two traces