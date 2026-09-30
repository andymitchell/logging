import { describe, it, expect, onTestFinished } from 'vitest';
import { TraceViewer } from './TraceViewer.ts';
import { Trace } from '../Trace.ts';
import { ChannelsLogStorage } from '../../log-storage/channels/ChannelsLogStorage.ts';
import { MemoryLogStorage } from '../../log-storage/memory/MemoryLogStorage.ts';
import { FailingLogStorage } from '../../log-storage/testing-helpers/FailingLogStorage.ts';
import { entriesOf, recordFailures, tracesOf } from '../../log-storage/testing-helpers/results.ts';
import { recordUnhandledRejections } from '../../log-storage/testing-helpers/recordUnhandledRejections.ts';
import type { WhereFilterDefinition } from '@andymitchell/objects/where-filter';
import type { LogEntry } from '../../log-storage/types.ts';
import type { LogReadResult } from '../../failures/types.ts';
import type { TraceEntryFilter, TraceResultFilter } from './types.ts';


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

    it('reads the store once, so the broken channel is listed once and the store\'s listeners hear one failure', async () => {
        const { storage } = await facadeWithOneBrokenReader();
        const failures = recordFailures(storage);

        const result = await new TraceViewer(storage).getTraces();

        expect(result.error?.failures).toHaveLength(1);
        expect(failures.heard).toEqual([result.error]);
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


describe('an app whose failure listener searches traces', () => {

    it('hears the failure it was told about once, and not again for its own search', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const broken = new FailingLogStorage('idb');
        const storage = new ChannelsLogStorage('app', [{ storage: broken }, { storage: new MemoryLogStorage('memory') }]);
        const trace = new Trace(storage, 'checkout');
        await trace.end();
        broken.fail = { queryEntries: { rejects: new Error('down') } };
        const viewer = new TraceViewer(storage);
        let heard = 0;
        storage.onFailure(() => {
            heard++;
            // Capped, so a listener that keeps hearing its own searches still stops.
            if( heard<=5 ) void viewer.getTraces();
        });

        await storage.get();

        expect(await unhandled.settled()).toEqual([]);
        expect(heard).toBe(1);
    });
});


describe('a developer viewing traces from a store that stops reading partway through the search', () => {

    /** A healthy store that fails every read once `readsLeft` have been made. */
    class StoreThatStopsReading extends MemoryLogStorage {
        readsLeft = Infinity;

        protected override queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
            if( this.readsLeft<=0 ) return Promise.reject(new Error('down'));
            this.readsLeft--;
            return super.queryEntries(filter, fullTextFilter);
        }
    }

    it('shows each trace with its id, its first entry\'s time and every entry the search read', async () => {
        const storage = new StoreThatStopsReading('app');
        const trace = new Trace(storage, 'checkout');
        await trace.log('charged');
        await trace.end();
        const recorded = entriesOf(await storage.get());
        storage.readsLeft = 1;

        const result = await new TraceViewer(storage).getTraces();

        expect(result.traces.map(found => ({ id: found.id, timestamp: found.timestamp, logs: found.logs.map(entry => entry.ulid) })))
            .toEqual([{ id: trace.getId(), timestamp: recorded[0]?.timestamp, logs: recorded.map(entry => entry.ulid) }]);
    });
});


describe('a developer searching traces with an entries filter that cannot be applied', () => {

    it('leaves out the entries it cannot match, says so without blaming the store, and throws nothing', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new MemoryLogStorage('my-app');
        const trace = new Trace(storage, 'checkout');
        await trace.end();
        const failures = recordFailures(storage);
        // @ts-expect-error -- an operator the matcher does not know (it throws on it) is what is under test
        const unusable: TraceEntryFilter = { message: { $notAnOperator: 1 } };

        const result = await new TraceViewer(storage).getTraces({ entries_filter: unusable });

        expect(result.ok).toBe(false);
        expect(result.traces).toEqual([]);
        expect(result.error?.failures).toEqual([{ source: 'TraceViewer', operation: 'read', message: 'Could not apply the entries filter or full-text search to every entry; those entries are left out.' }]);
        expect(failures.heard).toEqual([]);
        expect(await unhandled.settled()).toEqual([]);
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
