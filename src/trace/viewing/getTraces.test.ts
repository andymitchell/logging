import { MemoryLogger } from "../../raw-storage/memory/MemoryLogger.ts";
import { getTraces } from "./getTraces.ts";
import { Trace } from "../Trace.ts";
import { convertArrayToRecord, sleep } from "@andyrmitchell/utils";


describe('get-all', () => {
    it('get-all includes the entry', async () => {

        const rawLogger = new MemoryLogger('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const tracesArray = await getTraces(rawLogger);
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(traces[trace1.getId()]?.all.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
        expect(traces[trace1.getId()]?.matches.length).toBe(0);
        
        // Check the trace result id is the same as the first entry
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.all[0]?.meta?.trace.id);
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.all[0]?.meta?.trace.top_id);
        expect(traces[trace1.getId()]?.timestamp).toBe(traces[trace1.getId()]?.all[0]?.timestamp);
    
    })


    it('Includes second trace when get-all', async () => {

        const rawLogger = new MemoryLogger('');

        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const trace2 = new Trace(rawLogger);
        trace2.log('def');

        
        const tracesArray = await getTraces(rawLogger);
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(Object.keys(traces)).toEqual([trace1.getId(), trace2.getId()]);
        


    })

    it('logging twice will still use the correct trace id in the results', async () => {

        const rawLogger = new MemoryLogger('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        trace1.log('def2');
        
        const tracesArray = await getTraces(rawLogger);
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.all[0]?.meta?.trace.id);
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.all[0]?.meta?.trace.top_id);
        expect(traces[trace1.getId()]?.timestamp).toBe(traces[trace1.getId()]?.all[0]?.timestamp);
    
    })

})

describe('filtering', () => {
    it('get filter includes the entry', async () => {

        const rawLogger = new MemoryLogger('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const tracesArray = await getTraces(rawLogger, {type: 'info'});
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(traces[trace1.getId()]?.all.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
        expect(traces[trace1.getId()]?.matches.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
        expect(traces[trace1.getId()]?.matches.length).toBe(1);
    
    
    })
    
    
    
    
    it('Includes second trace when filtering across both', async () => {
    
        const rawLogger = new MemoryLogger('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const trace2 = new Trace(rawLogger);
        trace2.log('def');
    
        
        const tracesArray = await getTraces(rawLogger, {type: 'info'});
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(Object.keys(traces)).toEqual([trace1.getId(), trace2.getId()]);
        
    
    
    })
    
    it('Ignores second trace when using a filter for just 1', async () => {
    
        const rawLogger = new MemoryLogger('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const trace2 = new Trace(rawLogger);
        trace2.log('def');
    
        
        const tracesArray = await getTraces(rawLogger, {type: 'info', message: 'abc1'});
        const traces = convertArrayToRecord(tracesArray, 'id');
        expect(Object.keys(traces)).toEqual([trace1.getId()]);
        
    
    
    })
})

describe('filtering final traces', () => {

    it('filter traces on the timestamp', async () => {

        
        const rawLogger = new MemoryLogger('');
        
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');

        await sleep(3);

        const afterTs = Date.now()-1;
        
        const trace2 = new Trace(rawLogger);
        trace2.log('def');

        
        const tracesArray = await getTraces(rawLogger, undefined, {timestamp: {'gt': afterTs}});
        const traces = convertArrayToRecord(tracesArray, 'id');
        expect(Object.keys(traces)).toEqual([trace2.getId()]);
    })
})

describe('handles child traces', () => {
    it('it includes all items under the parent trace', async () => {
    
        const rawLogger = new MemoryLogger('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');

        const child1 = trace1.startSpan('child1');
        child1.log("abc1.child1");

        const child2 = child1.startSpan('child2');
        child2.log("abc1.child1.child2");
        
        const trace2 = new Trace(rawLogger);
        trace2.log('def');
    
        
        const tracesArray = await getTraces(rawLogger);
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(Object.keys(traces)).toEqual([trace1.getId(), trace2.getId()]);
        
        const trace1Entries = traces[trace1.getId()]!;
        expect(trace1Entries.all.map(x => x.type==='info'? x.message : undefined).filter(x => !!x)).toEqual(['abc1', 'abc1.child1', 'abc1.child1.child2'])
    
        // Check trace id is the same as the first entry
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.all[0]?.meta?.trace.id);
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.all[0]?.meta?.trace.top_id);
        expect(traces[trace1.getId()]?.timestamp).toBe(traces[trace1.getId()]?.all[0]?.timestamp);
    
    })
})