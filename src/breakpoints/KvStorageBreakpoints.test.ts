
import { describe, it, expect, onTestFinished } from 'vitest';
import {  MemoryStorage } from '@andymitchell/utils/kv-storage';
import { KvStorageBreakpoints } from './KvStorageBreakpoints.ts';
import { recordUnhandledRejections } from '../log-storage/testing-helpers/recordUnhandledRejections.ts';


import { commonBreakpointsTest } from './common-tests.ts';


commonBreakpointsTest(() => new KvStorageBreakpoints('test', new MemoryStorage()));


describe('a developer adding a breakpoint to a store that cannot save it', () => {

    class UnwritableStorage extends MemoryStorage {
        override async set(): Promise<void> { throw new Error('storage full'); }
    }

    it('sees the add fail, and nothing is left unhandled', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const breakpoints = new KvStorageBreakpoints('test', new UnwritableStorage());

        await expect(breakpoints.addBreakpoint({ type: 'error' })).rejects.toThrow('storage full');
        expect(await unhandled.settled()).toEqual([]);
    });
});

