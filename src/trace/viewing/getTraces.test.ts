import { MemoryLogger } from "../../raw-storage/memory/MemoryLogger.ts";
import { getTraces } from "./getTraces.ts";
import { Trace } from "../Trace.ts";


describe('get-all', () => {
    it('get-all includes the entry', async () => {

        const rawLogger = new MemoryLogger('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const traces = await getTraces(rawLogger);
        
        expect(traces[trace1.getId()]?.all.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
        expect(traces[trace1.getId()]?.matches.length).toBe(0);
    
    
    })


    it('Includes second trace when get-all', async () => {

        const rawLogger = new MemoryLogger('');

        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const trace2 = new Trace(rawLogger);
        trace2.log('def');

        
        const traces = await getTraces(rawLogger);
        
        expect(Object.keys(traces)).toEqual([trace1.getId(), trace2.getId()]);
        


    })

})

describe('filtering', () => {
    it('get filter includes the entry', async () => {

        const rawLogger = new MemoryLogger('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const traces = await getTraces(rawLogger, {type: 'info'});
        
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
    
        
        const traces = await getTraces(rawLogger, {type: 'info'});
        
        expect(Object.keys(traces)).toEqual([trace1.getId(), trace2.getId()]);
        
    
    
    })
    
    it('Ignores second trace when using a filter for just 1', async () => {
    
        const rawLogger = new MemoryLogger('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const trace2 = new Trace(rawLogger);
        trace2.log('def');
    
        
        const traces = await getTraces(rawLogger, {type: 'info', message: 'abc1'});
        
        expect(Object.keys(traces)).toEqual([trace1.getId()]);
        
    
    
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
    
        
        const traces = await getTraces(rawLogger);
        
        expect(Object.keys(traces)).toEqual([trace1.getId(), trace2.getId()]);
        
        const trace1Entries = traces[trace1.getId()]!;
        expect(trace1Entries.all.map(x => x.type==='info'? x.message : undefined).filter(x => !!x)).toEqual(['abc1', 'abc1.child1', 'abc1.child1.child2'])
    
    
    })
})