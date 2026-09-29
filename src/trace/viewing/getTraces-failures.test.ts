import { describe, it, expect, onTestFinished } from 'vitest';
import { TraceViewer } from './TraceViewer.ts';
import { Trace } from '../Trace.ts';
import { ChannelsLogStorage } from '../../log-storage/channels/ChannelsLogStorage.ts';
import { MemoryLogStorage } from '../../log-storage/memory/MemoryLogStorage.ts';
import { FailingLogStorage } from '../../log-storage/testing-helpers/FailingLogStorage.ts';
import { recordFailures, tracesOf } from '../../log-storage/testing-helpers/results.ts';
import { recordUnhandledRejections } from '../../log-storage/testing-helpers/recordUnhandledRejections.ts';
import type { TraceResultFilter } from './types.ts';


describe('a developer viewing traces from a facade when one channel cannot read', () => {

    async function facadeWithOneBrokenReader() {
        const broken = new FailingLogStorage('idb');
        const storage = new ChannelsLogStorage('app', [{ storage: broken }, { storage: new MemoryLogStorage('memory') }]);
        const trace = new Trace(storage, 'checkout');
        await trace.log('charged');
        await trace.end();
        broken.fail = { queryEntries: { rejects: new Error('down') } };
        return { storage, trace };
    }

    it('shows the traces the healthy channel holds, alongside the broken channel\'s failure', async () => {
        const { storage, trace } = await facadeWithOneBrokenReader();

        const result = await new TraceViewer(storage).getTraces();

        expect(result.ok).toBe(false);
        expect(result.traces.map(found => found.id)).toEqual([trace.getId()]);
        expect(result.traces[0]?.logs.map(entry => entry.type)).toEqual(['event', 'info', 'event']);
        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:idb', operation: 'read', message: 'Could not read the entries.' }]);
    });

    it('lists the broken channel once, though the search reads the store twice', async () => {
        const { storage } = await facadeWithOneBrokenReader();
        const failures = recordFailures(storage);

        const result = await new TraceViewer(storage).getTraces();

        expect(result.error?.failures).toHaveLength(1);
        // Each read of the store is its own failed call, so the store's listeners hear both.
        expect(failures.heard).toHaveLength(2);
    });

    it('fails a strict test reading it', async () => {
        const { storage } = await facadeWithOneBrokenReader();

        const result = await new TraceViewer(storage).getTraces();

        expect(() => tracesOf(result)).toThrow(/MemoryLogStorage:idb/);
    });

    it('reads the store once when it finds no traces, so the listeners hear one failure', async () => {
        const storage = new FailingLogStorage('idb', { queryEntries: { throws: new Error('down') } });
        const failures = recordFailures(storage);

        const result = await new TraceViewer(storage).getTraces();

        expect(result.traces).toEqual([]);
        expect(failures.heard).toHaveLength(1);
    });
});


describe('a developer filtering traces with a results filter that cannot be applied', () => {

    it('leaves out the traces it cannot match, says so, and throws nothing', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new MemoryLogStorage('my-app');
        const trace = new Trace(storage, 'checkout');
        await trace.end();
        // @ts-expect-error -- an operator the matcher does not know (it throws on it) is what is under test
        const unusable: TraceResultFilter = { id: { $notAnOperator: 1 } };

        const result = await new TraceViewer(storage).getTraces({ results_filter: unusable });

        expect(result.ok).toBe(false);
        expect(result.traces).toEqual([]);
        expect(result.error?.failures).toEqual([{ source: 'TraceViewer', operation: 'read', message: 'Could not apply the results filter to every trace; those traces are left out.' }]);
        expect(await unhandled.settled()).toEqual([]);
    });
});
