import { describe, it, expect, onTestFinished, vi } from 'vitest';
import { ChannelsLogStorage } from './ChannelsLogStorage.ts';
import { MemoryLogStorage } from '../memory/MemoryLogStorage.ts';
import { ConsoleLogStorage } from '../console/ConsoleLogStorage.ts';
import { FailingLogStorage } from '../testing-helpers/FailingLogStorage.ts';
import { ForeignLogStorage, type ForeignBehaviour } from '../testing-helpers/ForeignLogStorage.ts';
import { entriesOf, entryOf, recordFailures } from '../testing-helpers/results.ts';
import type { LoggingResult } from '../../failures/types.ts';
import { recordUnhandledRejections } from '../testing-helpers/recordUnhandledRejections.ts';

describe('an app writing through a Channels facade when one channel fails', () => {

    it('still records the entry in every healthy channel', async () => {
        const healthy = new MemoryLogStorage('memory');
        const failing = new FailingLogStorage('idb', { commitEntry: { throws: new Error('down') } });
        const storage = new ChannelsLogStorage('app', [{ storage: failing }, { storage: healthy }]);

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(entriesOf(await healthy.get()).map(entry => entry.ulid)).toEqual([result.entry?.ulid]);
    });

    it('fails the write, carrying the entry and listing the failing child\'s own failure as the same object', async () => {
        const failing = new FailingLogStorage('idb', { commitEntry: { throws: new Error('down') } });
        const childFailures = recordFailures(failing);
        const storage = new ChannelsLogStorage('app', [{ storage: failing }, { storage: new MemoryLogStorage('memory') }]);

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(result.ok).toBe(false);
        expect(result.entry).toMatchObject({ type: 'warn', message: 'slow' });
        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:idb', operation: 'write', message: 'Could not record the entry.' }]);
        expect(result.error?.failures[0]).toBe(childFailures.heard[0]?.failures[0]);
    });

    it('tells the facade\'s listeners the combined error once, and the child\'s listeners its own once', async () => {
        const failing = new FailingLogStorage('idb', { commitEntry: { rejects: new Error('down') } });
        const alsoFailing = new FailingLogStorage('backup', { commitEntry: { rejects: new Error('down') } });
        const storage = new ChannelsLogStorage('app', [{ storage: failing }, { storage: alsoFailing }]);
        const facadeFailures = recordFailures(storage);
        const childFailures = recordFailures(failing);

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(facadeFailures.heard).toEqual([result.error]);
        expect(facadeFailures.heard[0]?.failures.map(failure => failure.source)).toEqual(['MemoryLogStorage:idb', 'MemoryLogStorage:backup']);
        expect(childFailures.heard).toHaveLength(1);
        expect(childFailures.heard[0]?.failures).toHaveLength(1);
    });

    it('lists failures in channel order', async () => {
        const storage = new ChannelsLogStorage('app', [
            { storage: new FailingLogStorage('first', { commitEntry: { rejects: new Error('slow to fail') } }) },
            { storage: new MemoryLogStorage('healthy') },
            { storage: new FailingLogStorage('third', { commitEntry: { throws: new Error('fails at once') } }) },
        ]);

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(result.error?.failures.map(failure => failure.source)).toEqual(['MemoryLogStorage:first', 'MemoryLogStorage:third']);
    });

    it('succeeds when every matching channel records the entry, whatever the non-matching ones would do', async () => {
        const storage = new ChannelsLogStorage('app', [
            { storage: new FailingLogStorage('errors-only', { commitEntry: { throws: new Error('down') } }), accept: { type: 'error' } },
            { storage: new MemoryLogStorage('memory') },
        ]);

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(result.ok).toBe(true);
    });

    it('hands every channel the entry straight away, so an unawaited write is readable from a child', async () => {
        const healthy = new MemoryLogStorage('memory');
        const storage = new ChannelsLogStorage('app', [{ storage: new FailingLogStorage('idb', { commitEntry: { rejects: new Error('down') } }) }, { storage: healthy }]);

        void storage.add({ type: 'info', message: 'unawaited' });

        expect(entriesOf(await healthy.get()).map(entry => entry.message)).toEqual(['unawaited']);
    });
});


describe('an app reading through a Channels facade when one channel cannot read', () => {

    async function facadeWithOneBrokenReader() {
        const healthy = new MemoryLogStorage('memory');
        const broken = new FailingLogStorage('idb');
        const storage = new ChannelsLogStorage('app', [{ storage: broken }, { storage: healthy }]);
        const written = entryOf(await storage.add({ type: 'warn', message: 'slow' }));
        broken.fail = { queryEntries: { rejects: new Error('down') } };
        return { storage, broken, healthy, written };
    }

    it('returns the healthy channel\'s entries alongside the broken channel\'s failure, as the same object', async () => {
        const { storage, broken, written } = await facadeWithOneBrokenReader();
        const childFailures = recordFailures(broken);

        const result = await storage.get();

        expect(result.ok).toBe(false);
        // By ULID: a channel stamps its own `timestamp` when it records the entry.
        expect(result.entries.map(entry => entry.ulid)).toEqual([written.ulid]);
        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:idb', operation: 'read', message: 'Could not read the entries.' }]);
        expect(result.error?.failures[0]).toBe(childFailures.heard[0]?.failures[0]);
    });

    it('tells the facade\'s listeners the combined error once', async () => {
        const { storage } = await facadeWithOneBrokenReader();
        const facadeFailures = recordFailures(storage);

        const result = await storage.get();

        expect(facadeFailures.heard).toHaveLength(1);
        expect(facadeFailures.heard[0]).toBe(result.error);
    });

    it('fails a strict test reading it, so a dead child cannot hide behind a healthy one', async () => {
        const { storage } = await facadeWithOneBrokenReader();

        const result = await storage.get();

        expect(() => entriesOf(result)).toThrow(/MemoryLogStorage:idb/);
    });

    it('lists every broken channel\'s failure in channel order, with no entries when none could read', async () => {
        const storage = new ChannelsLogStorage('app', [
            { storage: new FailingLogStorage('first', { queryEntries: { rejects: new Error('slow to fail') } }) },
            { storage: new FailingLogStorage('second', { queryEntries: { throws: new Error('fails at once') } }) },
        ]);

        const result = await storage.get();

        expect(result.entries).toEqual([]);
        expect(result.error?.failures.map(failure => failure.source)).toEqual(['MemoryLogStorage:first', 'MemoryLogStorage:second']);
    });

    it('reads ok from a facade whose other channel keeps no entries, such as the console', async () => {
        const healthy = new MemoryLogStorage('memory');
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        onTestFinished(() => consoleWarn.mockRestore());
        const storage = new ChannelsLogStorage('app', [{ storage: new ConsoleLogStorage() }, { storage: healthy }]);
        const written = entryOf(await storage.add({ type: 'warn', message: 'slow' }));

        const result = await storage.get();

        expect(result.ok).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.entries.map(entry => entry.ulid)).toEqual([written.ulid]);
    });
});


describe('an app resetting or clearing old entries through a Channels facade when one channel fails', () => {

    const adminCalls: [name: string, hook: 'resetEntries' | 'clearOldEntries', operation: string, call: (storage: ChannelsLogStorage) => Promise<LoggingResult>][] = [
        ['reset', 'resetEntries', 'reset', storage => storage.reset()],
        ['forceClearOldEntries', 'clearOldEntries', 'clear_old_entries', storage => storage.forceClearOldEntries()],
    ];

    it.each(adminCalls)('%s still reaches the healthy channel, and lists the broken channel\'s failure', async (_name, hook, operation, call) => {
        const healthy = new MemoryLogStorage('memory', { max_age: [{ max_ms: -1 }] });
        const storage = new ChannelsLogStorage('app', [{ storage: new FailingLogStorage('idb', { [hook]: { throws: new Error('down') } }) }, { storage: healthy }]);
        await healthy.add({ type: 'warn', message: 'slow' });

        const result = await call(storage);

        expect(result.ok).toBe(false);
        expect(result.error?.failures).toEqual([expect.objectContaining({ source: 'MemoryLogStorage:idb', operation })]);
        expect(entriesOf(await healthy.get())).toEqual([]);
    });
});


describe('an app whose channel transform throws', () => {

    it('still records the entry in the other channels, and names the channel that threw', async () => {
        const healthy = new MemoryLogStorage('memory');
        const storage = new ChannelsLogStorage('app', [
            { storage: healthy },
            { storage: new MemoryLogStorage('webhook'), transform: () => { throw new Error('transform bug with secret-value'); } },
        ]);

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(entriesOf(await healthy.get())).toHaveLength(1);
        expect(result.error?.failures).toEqual([{
            source: 'ChannelsLogStorage:app',
            operation: 'write',
            message: 'channels[1] threw while filtering, transforming or handing over the entry.',
        }]);
        expect(JSON.stringify(result.error)).not.toContain('secret-value');
    });
});


describe('an app whose channel is a store written without BaseLogStorage', () => {

    const foreignChannels: [ForeignBehaviour, string][] = [
        ['throws', 'channels[0] threw while filtering, transforming or handing over the entry.'],
        ['rejects', 'channels[0] rejected instead of answering with a result.'],
        ['answers-old-shape', 'channels[0] answered with something that is not a write result.'],
        ['answers-nothing', 'channels[0] answered with something that is not a write result.'],
    ];

    it.each(foreignChannels)('names the channel whose add %s, still records in the others, and leaves nothing unhandled', async (behaviour, message) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const healthy = new MemoryLogStorage('memory');
        const storage = new ChannelsLogStorage('app', [{ storage: new ForeignLogStorage(behaviour) }, { storage: healthy }]);

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(result.error?.failures).toEqual([{ source: 'ChannelsLogStorage:app', operation: 'write', message }]);
        expect(entriesOf(await healthy.get())).toHaveLength(1);
        expect(await unhandled.settled()).toEqual([]);
    });

    const foreignReads: [ForeignBehaviour, string][] = [
        ['throws', 'channels[0] threw instead of answering the read with a result.'],
        ['rejects', 'channels[0] rejected instead of answering with a result.'],
        ['answers-old-shape', 'channels[0] answered with something that is not a read result.'],
        ['answers-nothing', 'channels[0] answered with something that is not a read result.'],
    ];

    it.each(foreignReads)('names the channel whose get %s, still returns the others\' entries, and leaves nothing unhandled', async (behaviour, message) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const healthy = new MemoryLogStorage('memory');
        const written = entryOf(await healthy.add({ type: 'warn', message: 'slow' }));
        const storage = new ChannelsLogStorage('app', [{ storage: new ForeignLogStorage(behaviour) }, { storage: healthy }]);

        const result = await storage.get();

        expect(result.error?.failures).toEqual([{ source: 'ChannelsLogStorage:app', operation: 'read', message }]);
        expect(result.entries).toEqual([written]);
        expect(await unhandled.settled()).toEqual([]);
    });

    const foreignAdmin: [call: string, behaviour: ForeignBehaviour, operation: string, message: string, (storage: ChannelsLogStorage) => Promise<LoggingResult>][] = [
        ['reset', 'throws', 'reset', 'channels[0] threw while filtering or handing over the entries.', storage => storage.reset()],
        ['reset', 'rejects', 'reset', 'channels[0] rejected instead of answering with a result.', storage => storage.reset()],
        ['reset', 'answers-old-shape', 'reset', 'channels[0] answered with something that is not a result.', storage => storage.reset()],
        ['forceClearOldEntries', 'throws', 'clear_old_entries', 'channels[0] threw instead of answering with a result.', storage => storage.forceClearOldEntries()],
        ['forceClearOldEntries', 'rejects', 'clear_old_entries', 'channels[0] rejected instead of answering with a result.', storage => storage.forceClearOldEntries()],
        ['forceClearOldEntries', 'answers-old-shape', 'clear_old_entries', 'channels[0] answered with something that is not a result.', storage => storage.forceClearOldEntries()],
    ];

    it.each(foreignAdmin)('names the channel when %s meets a foreign store that %s', async (_call, behaviour, operation, message, call) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new ChannelsLogStorage('app', [{ storage: new ForeignLogStorage(behaviour) }, { storage: new MemoryLogStorage('memory') }]);

        const result = await call(storage);

        expect(result.error?.failures).toEqual([{ source: 'ChannelsLogStorage:app', operation, message }]);
        expect(await unhandled.settled()).toEqual([]);
    });
});


describe('an app resetting a Channels facade with entries', () => {

    it('gives each channel only the entries its filter accepts', async () => {
        const errors = new MemoryLogStorage('errors');
        const everything = new MemoryLogStorage('everything');
        const storage = new ChannelsLogStorage('app', [{ storage: errors, accept: { type: 'error' } }, { storage: everything }]);
        const source = new MemoryLogStorage('source');
        const entries = [entryOf(await source.add({ type: 'error', message: 'broke' })), entryOf(await source.add({ type: 'info', message: 'fine' }))];

        const result = await storage.reset(entries);

        expect(result).toEqual({ ok: true });
        expect(entriesOf(await errors.get()).map(entry => entry.message)).toEqual(['broke']);
        expect(entriesOf(await everything.get()).map(entry => entry.message)).toEqual(['broke', 'fine']);
    });
});
