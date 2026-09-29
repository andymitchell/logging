import { describe, it, expect, onTestFinished } from 'vitest';
import { ChannelsLogStorage } from './ChannelsLogStorage.ts';
import { MemoryLogStorage } from '../memory/MemoryLogStorage.ts';
import { FailingLogStorage } from '../testing-helpers/FailingLogStorage.ts';
import { ForeignLogStorage, type ForeignAddBehaviour } from '../testing-helpers/ForeignLogStorage.ts';
import { recordFailures } from '../testing-helpers/results.ts';
import { recordUnhandledRejections } from '../testing-helpers/recordUnhandledRejections.ts';

describe('an app writing through a Channels facade when one channel fails', () => {

    it('still records the entry in every healthy channel', async () => {
        const healthy = new MemoryLogStorage('memory');
        const failing = new FailingLogStorage('idb', { commitEntry: { throws: new Error('down') } });
        const storage = new ChannelsLogStorage('app', [{ storage: failing }, { storage: healthy }]);

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect((await healthy.get()).map(entry => entry.ulid)).toEqual([result.entry?.ulid]);
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

        expect((await healthy.get()).map(entry => entry.message)).toEqual(['unawaited']);
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

        expect(await healthy.get()).toHaveLength(1);
        expect(result.error?.failures).toEqual([{
            source: 'ChannelsLogStorage:app',
            operation: 'write',
            message: 'channels[1] threw while filtering, cloning, transforming or handing over the entry.',
        }]);
        expect(JSON.stringify(result.error)).not.toContain('secret-value');
    });
});


describe('an app whose channel is a store written without BaseLogStorage', () => {

    const foreignChannels: [ForeignAddBehaviour, string][] = [
        ['throws', 'channels[0] threw while filtering, cloning, transforming or handing over the entry.'],
        ['rejects', 'channels[0] rejected instead of answering with a result.'],
        ['answers-bare-entry', 'channels[0] answered with something that is not a write result.'],
        ['answers-nothing', 'channels[0] answered with something that is not a write result.'],
    ];

    it.each(foreignChannels)('names the channel whose add %s, still records in the others, and leaves nothing unhandled', async (addBehaviour, message) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const healthy = new MemoryLogStorage('memory');
        const storage = new ChannelsLogStorage('app', [{ storage: new ForeignLogStorage(addBehaviour) }, { storage: healthy }]);

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(result.error?.failures).toEqual([{ source: 'ChannelsLogStorage:app', operation: 'write', message }]);
        expect(await healthy.get()).toHaveLength(1);
        expect(await unhandled.settled()).toEqual([]);
    });
});
