import { MemoryLogStorage } from "../../log-storage/memory/MemoryLogStorage.ts";
import { getTraces } from "./getTraces.ts";
import { Trace } from "../Trace.ts";
import { convertArrayToRecord, sleep } from "@andyrmitchell/utils";


describe('get-all', () => {
    it('get-all includes the entry', async () => {

        const rawLogger = new MemoryLogStorage('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const tracesArray = await getTraces(rawLogger);
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(traces[trace1.getId()]?.logs.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
        expect(traces[trace1.getId()]?.matches.length).toBe(0);
        
        // Check the trace result id is the same as the first entry
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.logs[0]?.meta?.span.id);
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.logs[0]?.meta?.span.top_id);
        expect(traces[trace1.getId()]?.timestamp).toBe(traces[trace1.getId()]?.logs[0]?.timestamp);
    
    })


    it('Includes second trace when get-all', async () => {

        const rawLogger = new MemoryLogStorage('');

        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const trace2 = new Trace(rawLogger);
        trace2.log('def');

        
        const tracesArray = await getTraces(rawLogger);
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(Object.keys(traces)).toEqual([trace1.getId(), trace2.getId()]);
        


    })

    it('logging twice will still use the correct trace id in the results', async () => {

        const rawLogger = new MemoryLogStorage('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        trace1.log('def2');
        
        const tracesArray = await getTraces(rawLogger);
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.logs[0]?.meta?.span.id);
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.logs[0]?.meta?.span.top_id);
        expect(traces[trace1.getId()]?.timestamp).toBe(traces[trace1.getId()]?.logs[0]?.timestamp);
    
    })

})

describe('filtering', () => {
    it('get filter includes the entry', async () => {

        const rawLogger = new MemoryLogStorage('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const tracesArray = await getTraces(rawLogger, {entries_filter: {type: 'info'}});
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(traces[trace1.getId()]?.logs.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
        expect(traces[trace1.getId()]?.matches.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
        expect(traces[trace1.getId()]?.matches.length).toBe(1);
    
    
    })
    

    
    
    
    it('Includes second trace when filtering across both', async () => {
    
        const rawLogger = new MemoryLogStorage('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const trace2 = new Trace(rawLogger);
        trace2.log('def');
    
        
        const tracesArray = await getTraces(rawLogger, {entries_filter: {type: 'info'}});
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(Object.keys(traces)).toEqual([trace1.getId(), trace2.getId()]);
        
    
    
    })
    
    it('Ignores second trace when using a filter for just 1', async () => {
    
        const rawLogger = new MemoryLogStorage('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        
        const trace2 = new Trace(rawLogger);
        trace2.log('def');
    
        
        const tracesArray = await getTraces(rawLogger, {entries_filter: {type: 'info', message: 'abc1'}});
        const traces = convertArrayToRecord(tracesArray, 'id');
        expect(Object.keys(traces)).toEqual([trace1.getId()]);
        
    
    
    })

    describe('context variations', () => {
        it('filters on basic context object', async () => {

            const rawLogger = new MemoryLogStorage('');
        
            const trace1 = new Trace(rawLogger);
            trace1.log('abc1', {name: 'Bob'});
            
            const tracesArray = await getTraces(rawLogger, {entries_filter: {context: {name: 'Bob'}}});
            const traces = convertArrayToRecord(tracesArray, 'id');
            
            expect(traces[trace1.getId()]?.matches.length).toBe(1);
        
            const tracesArray1 = await getTraces(rawLogger, {entries_filter: {context: {name: 'Sue'}}});
            const traces1 = convertArrayToRecord(tracesArray1, 'id');
            
            expect(traces1[trace1.getId()]?.matches.length).toBe(undefined);
        
        })

        it('filters on a string', async () => {

            const rawLogger = new MemoryLogStorage('');
        
            const trace1 = new Trace(rawLogger);
            trace1.log('abc1', 'Bob');
            
            const tracesArray = await getTraces(rawLogger, {entries_filter: {context: 'Bob'}});
            const traces = convertArrayToRecord(tracesArray, 'id');
            
            expect(traces[trace1.getId()]?.matches.length).toBe(1);
        
            const tracesArray1 = await getTraces(rawLogger, {entries_filter: {context: 'Sue'}});
            const traces1 = convertArrayToRecord(tracesArray1, 'id');
            
            expect(traces1[trace1.getId()]?.matches.length).toBe(undefined);
        
        })


        it('filters on an array', async () => {

            const rawLogger = new MemoryLogStorage('');
        
            const trace1 = new Trace(rawLogger);
            trace1.log('abc1', ['Bob']);
            
            const tracesArray = await getTraces(rawLogger, {entries_filter: {context: {contains: 'Bob'}}});
            const traces = convertArrayToRecord(tracesArray, 'id');
            
            expect(traces[trace1.getId()]?.matches.length).toBe(1);
        
            const tracesArray1 = await getTraces(rawLogger, {entries_filter: {context: {contains: 'Sue'}}});
            const traces1 = convertArrayToRecord(tracesArray1, 'id');
            
            expect(traces1[trace1.getId()]?.matches.length).toBe(undefined);
        
        })
    })
})


describe('filtering full text', () => {
    it('get filter includes the entry', async () => {

        const rawLogger = new MemoryLogStorage('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        trace1.log('def');

        const trace2 = new Trace(rawLogger);
        trace2.log('xyz');
        
        const tracesArray = await getTraces(rawLogger, {entries_full_text_search: 'abc1'});
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(Object.keys(traces).length).toBe(1);
        expect(traces[trace1.getId()]?.logs.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
        expect(traces[trace1.getId()]?.matches.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
        expect(traces[trace1.getId()]?.matches.length).toBe(1);
    
    
    })

    it('get filter omits when no match', async () => {

        const rawLogger = new MemoryLogStorage('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        trace1.log('def');

        
        const tracesArray = await getTraces(rawLogger, {entries_full_text_search: 'xyz'});
        const traces = convertArrayToRecord(tracesArray, 'id');
        
        expect(Object.keys(traces).length).toBe(0);
    
    })
    
    
    
    
})

describe('filtering final traces', () => {

    it('filter traces on the timestamp', async () => {

        
        const rawLogger = new MemoryLogStorage('');
        
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');

        await sleep(3);

        const afterTs = Date.now()-1;
        
        const trace2 = new Trace(rawLogger);
        trace2.log('def');

        
        const tracesArray = await getTraces(rawLogger, {results_filter: {timestamp: {'gt': afterTs}}});
        const traces = convertArrayToRecord(tracesArray, 'id');
        expect(Object.keys(traces)).toEqual([trace2.getId()]);
    })
})

describe('toggle include all', () => {
    it('get filter includes the entry', async () => {

        const rawLogger = new MemoryLogStorage('');
    
        const trace1 = new Trace(rawLogger);
        trace1.log('abc1');
        trace1.log('abc2');
        
        const tracesArray = await getTraces(rawLogger, {entries_filter: {message: 'abc1'}}, false);
        expect(tracesArray[0]?.matches[0]?.message).toBe('abc1');
        expect(tracesArray[0]?.logs).toEqual([]);
        
    
    })
})

describe('handles child traces', () => {
    it('it includes all items under the parent trace', async () => {
    
        const rawLogger = new MemoryLogStorage('');
    
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
        expect(trace1Entries.logs.map(x => x.type==='info'? x.message : undefined).filter(x => !!x)).toEqual(['abc1', 'abc1.child1', 'abc1.child1.child2'])
    
        // Check trace id is the same as the first entry
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.logs[0]?.meta?.span.id);
        expect(traces[trace1.getId()]?.id).toBe(traces[trace1.getId()]?.logs[0]?.meta?.span.top_id);
        expect(traces[trace1.getId()]?.timestamp).toBe(traces[trace1.getId()]?.logs[0]?.timestamp);
    
    })
})