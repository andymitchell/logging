import { MemoryLogger } from "../raw-storage/memory/MemoryLogger.ts";
import { getTraces } from "./getTraces.ts";
import { Trace } from "./Trace.ts";



it('get-all includes the entry', async () => {

    const rawLogger = new MemoryLogger('');

    const trace1 = new Trace(rawLogger);
    trace1.log('abc1');
    
    const traces = await getTraces(rawLogger);
    
    expect(traces[trace1.getId()]?.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
    


})

it('get filter includes the entry', async () => {

    const rawLogger = new MemoryLogger('');

    const trace1 = new Trace(rawLogger);
    trace1.log('abc1');
    
    const traces = await getTraces(rawLogger, {type: 'info'});
    
    expect(traces[trace1.getId()]?.some(x => x.type==='info' && x.message==='abc1')).toBe(true)
    


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

// Get across two traces