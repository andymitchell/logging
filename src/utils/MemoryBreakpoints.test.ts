import {it} from 'vitest';
import { GLOBAL_BREAKPOINT_FUNCTION, globalThisWithBreakpointFunction, MemoryBreakpoints } from './MemoryBreakpoints.ts';
import type { AcceptLogEntry } from '../raw-storage/types.ts';
import { promiseWithTrigger } from '@andyrmitchell/utils';



it('It calls back on break point', async () => {
    const mb = new MemoryBreakpoints();


    type TestObjectType = Partial<AcceptLogEntry>;
    const testObject:TestObjectType = {message:"Hi abc!"};

    const pwt = promiseWithTrigger<TestObjectType>(100);
    globalThisWithBreakpointFunction[GLOBAL_BREAKPOINT_FUNCTION] = (entry) => {
        pwt.trigger(entry);
    }

    mb.addBreakpoint({'message': {contains: 'abc'}});

    mb.test(testObject)

    const final = await pwt.promise;
    expect(final).toEqual(testObject);
})


it('It ignores objects that do not match', async () => {
    const mb = new MemoryBreakpoints();

    type TestObjectType = Partial<AcceptLogEntry>;
    const testObject:TestObjectType = {message:"Hi abc!"};

    const pwt = promiseWithTrigger<TestObjectType>(100);
    globalThisWithBreakpointFunction[GLOBAL_BREAKPOINT_FUNCTION] = (entry) => {
        pwt.trigger(entry);
    }

    mb.addBreakpoint({'message': {contains: 'def'}});

    mb.test(testObject)

    expect(pwt.promise).rejects.toThrow('Timed out')    
})



it('It removes a break point', async () => {
    const mb = new MemoryBreakpoints();


    type TestObjectType = Partial<AcceptLogEntry>;
    const testObject:TestObjectType = {message:"Hi abc!"};

    const pwt = promiseWithTrigger<TestObjectType>(100);
    globalThisWithBreakpointFunction[GLOBAL_BREAKPOINT_FUNCTION] = (entry) => {
        pwt.trigger(entry);
    }

    const bp = mb.addBreakpoint({'message': {contains: 'abc'}});
    mb.removeBreakpoint(bp.id);

    mb.test(testObject)

    expect(pwt.promise).rejects.toThrow('Timed out')    
})