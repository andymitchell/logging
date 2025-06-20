import {it} from 'vitest';
import type { AcceptLogEntry } from '../log-storage/types.ts';
import { promiseWithTrigger } from '@andyrmitchell/utils';
import type { IBreakpoints } from './types.ts';


type CreateBreakpointsClass = () => IBreakpoints;

export function commonBreakpointsTest(createBreakpointsClass:CreateBreakpointsClass) {



    it('It calls back on break point', async () => {

        const pwt = promiseWithTrigger<TestObjectType>(100);
        const mb = createBreakpointsClass();
        mb.setHandler((entry) => {
            pwt.trigger(entry);
        });


        type TestObjectType = Partial<AcceptLogEntry>;
        const testObject:TestObjectType = {message:"Hi abc!"};

        mb.addBreakpoint({'message': {contains: 'abc'}});

        mb.test(testObject)

        const final = await pwt.promise;
        expect(final).toEqual(testObject);
    })


    it('It ignores objects that do not match', async () => {
        const pwt = promiseWithTrigger<TestObjectType>(100);
        const mb = createBreakpointsClass();
        mb.setHandler((entry) => {
            pwt.trigger(entry);
        });

        type TestObjectType = Partial<AcceptLogEntry>;
        const testObject:TestObjectType = {message:"Hi abc!"};

        

        mb.addBreakpoint({'message': {contains: 'def'}});

        mb.test(testObject)

        await expect(pwt.promise).rejects.toThrow('Timed out')    
    })



    it('It removes a break point', async () => {
        const pwt = promiseWithTrigger<TestObjectType>(100);
        const mb = createBreakpointsClass();
        mb.setHandler((entry) => {
            pwt.trigger(entry);
        });


        type TestObjectType = Partial<AcceptLogEntry>;
        const testObject:TestObjectType = {message:"Hi abc!"};

        
        

        const bp = await mb.addBreakpoint({'message': {contains: 'abc'}});
        mb.removeBreakpoint(bp.id);

        mb.test(testObject)

        await expect(pwt.promise).rejects.toThrow('Timed out')    
    })
}