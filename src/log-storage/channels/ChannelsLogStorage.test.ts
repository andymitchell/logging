import { MemoryLogStorage } from "../memory/MemoryLogStorage.ts"
import { ChannelsLogStorage, type Channel } from "./ChannelsLogStorage.ts"

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { AcceptLogEntry, LogEntry } from '../types.ts'; 


it('basic', async () => {
    const memoryLogger = new MemoryLogStorage('');

    const storage = new ChannelsLogStorage('', [
        {
            storage: memoryLogger
        }
    ]);

    const added = await storage.add({
        type: 'info',
        message: 'Hello',
        context: {
            name: 'Bob'
        }
    });





    const items = await memoryLogger.get();
    console.log(items);

    expect(added.ulid).toBe(items[0]?.ulid);


})


describe('ChannelsLogStorage: commitEntry (via add)', () => {
    let memoryLogger1: MemoryLogStorage;
    let memoryLogger2: MemoryLogStorage;
    let memoryLogger3: MemoryLogStorage;

    // Reset logger instances before each test to ensure isolation
    beforeEach(() => {
        memoryLogger1 = new MemoryLogStorage('mem1');
        memoryLogger2 = new MemoryLogStorage('mem2');
        memoryLogger3 = new MemoryLogStorage('mem3');
    });

    it('should distribute a log entry to all channels when no accept filters are provided', async () => {
        const channels: Channel[] = [
            { storage: memoryLogger1 },
            { storage: memoryLogger2 },
        ];
        const channelsLogger = new ChannelsLogStorage('test-app', channels);

        const entry: AcceptLogEntry = { type: 'info', message: 'broadcast message' };
        await channelsLogger.add(entry);

        const logs1 = await memoryLogger1.get();
        const logs2 = await memoryLogger2.get();

        expect(logs1).toHaveLength(1);
        expect(logs2).toHaveLength(1);
        expect(logs1[0]!.message).toBe('broadcast message');
        expect(logs2[0]!.message).toBe('broadcast message');
        // Ensure the ULID is the same, proving it's the "same" log event
        expect(logs1[0]!.ulid).toBe(logs2[0]!.ulid);
    });

    it('should only distribute entries to channels with a matching accept filter', async () => {
        const channels: Channel[] = [
            { storage: memoryLogger1, accept: { type: 'error' } },
            { storage: memoryLogger2, accept: { type: 'info' } },
            { storage: memoryLogger3 }, // Accepts all
        ];
        const channelsLogger = new ChannelsLogStorage('test-app', channels);

        await channelsLogger.add({ type: 'info', message: 'Just some info' });
        await channelsLogger.add({ type: 'error', message: 'An error occurred' });

        const errorChannelLogs = await memoryLogger1.get();
        const infoChannelLogs = await memoryLogger2.get();
        const allChannelLogs = await memoryLogger3.get();

        expect(errorChannelLogs).toHaveLength(1);
        expect(errorChannelLogs[0]!.type).toBe('error');

        expect(infoChannelLogs).toHaveLength(1);
        expect(infoChannelLogs[0]!.type).toBe('info');

        expect(allChannelLogs).toHaveLength(2);
    });

    it('should correctly apply a transform function to an entry for the specific channel', async () => {
        const channels: Channel[] = [
            {
                storage: memoryLogger1,
                transform: (entry) => {
                    entry.message = `[TRANSFORMED] ${entry.message}`;
                    if (!entry.context) entry.context = {};
                    entry.context.transformed = true;
                    return entry;
                }
            },
            { storage: memoryLogger2 },
        ];
        const channelsLogger = new ChannelsLogStorage('test-app', channels);

        await channelsLogger.add({ type: 'warn', message: 'A warning' });

        const transformedLogs = await memoryLogger1.get();
        const originalLogs = await memoryLogger2.get();

        expect(transformedLogs).toHaveLength(1);
        expect(transformedLogs[0]!.message).toBe('[TRANSFORMED] A warning');
        expect(transformedLogs[0]!.context?.transformed).toBe(true);

        expect(originalLogs).toHaveLength(1);
        expect(originalLogs[0]!.message).toBe('A warning');
        expect(originalLogs[0]!.context?.transformed).toBeUndefined();
    });

    it('should handle channels with both accept and transform properties correctly', async () => {
        const channels: Channel[] = [
            {
                storage: memoryLogger1,
                accept: { type: 'critical' },
                transform: (entry) => {
                    entry.message = `[WEBHOOK] ${entry.message}`;
                    return entry;
                }
            },
            { storage: memoryLogger2 }, // Accepts all, no transform
        ];
        const channelsLogger = new ChannelsLogStorage('test-app', channels);

        await channelsLogger.add({ type: 'info', message: 'regular log' });
        await channelsLogger.add({ type: 'critical', message: 'System failure' });

        const webhookLogs = await memoryLogger1.get();
        const generalLogs = await memoryLogger2.get();

        expect(webhookLogs).toHaveLength(1);
        expect(webhookLogs[0]!.message).toBe('[WEBHOOK] System failure');
        expect(webhookLogs[0]!.type).toBe('critical');

        expect(generalLogs).toHaveLength(2);
        const criticalLogInGeneral = generalLogs.find(l => l.type === 'critical');
        expect(criticalLogInGeneral?.message).toBe('System failure');
    });

    it('should ensure transforms are isolated between channels thanks to structuredClone', async () => {
        const channels: Channel[] = [
            {
                storage: memoryLogger1,
                transform: (entry) => {
                    if (entry.context) entry.context.channel = 'A';
                    return entry;
                }
            },
            {
                storage: memoryLogger2,
                transform: (entry) => {
                    if (entry.context) entry.context.channel = 'B';
                    return entry;
                }
            }
        ];
        const channelsLogger = new ChannelsLogStorage('test-app', channels);

        await channelsLogger.add({ type: 'info', message: 'test', context: {} });

        const logs1 = await memoryLogger1.get();
        const logs2 = await memoryLogger2.get();

        expect(logs1[0]!.context?.channel).toBe('A');
        expect(logs2[0]!.context?.channel).toBe('B');
    });

    it('should not distribute an entry if no channels match the accept filter', async () => {
        const channels: Channel[] = [
            { storage: memoryLogger1, accept: { type: 'error' } },
            { storage: memoryLogger2, accept: { type: 'critical' } },
        ];
        const channelsLogger = new ChannelsLogStorage('test-app', channels);

        // Spy on the commitEntry methods to be certain
        const spy1 = vi.spyOn(memoryLogger1, 'add');
        const spy2 = vi.spyOn(memoryLogger2, 'add');

        await channelsLogger.add({ type: 'info', message: 'This should go nowhere' });

        const logs1 = await memoryLogger1.get();
        const logs2 = await memoryLogger2.get();

        expect(logs1).toHaveLength(0);
        expect(logs2).toHaveLength(0);
        expect(spy1).not.toHaveBeenCalled();
        expect(spy2).not.toHaveBeenCalled();
    });

    it('should handle complex accept filters (e.g., NOT operator)', async () => {
        const channels: Channel[] = [
            { storage: memoryLogger1, accept: { NOT: [{type: 'info' }]} }, // Everything BUT info
        ];
        const channelsLogger = new ChannelsLogStorage('test-app', channels);

        await channelsLogger.add({ type: 'info', message: 'ignored' });
        await channelsLogger.add({ type: 'warn', message: 'accepted' });
        await channelsLogger.add({ type: 'error', message: 'accepted too' });

        const logs = await memoryLogger1.get();

        expect(logs).toHaveLength(2);
        expect(logs.find(l => l.type === 'info')).toBeUndefined();
        expect(logs.find(l => l.type === 'warn')).toBeDefined();
        expect(logs.find(l => l.type === 'error')).toBeDefined();
    });

    it('should call the underlying storage `add` method, not `commitEntry`', async () => {
        // This test ensures we're respecting the ILogStorage interface of the channels
        const addSpy = vi.spyOn(memoryLogger1, 'add');
        const commitSpy = vi.spyOn(memoryLogger1 as any, 'commitEntry'); // cast to any to access protected

        const channels: Channel[] = [{ storage: memoryLogger1 }];
        const channelsLogger = new ChannelsLogStorage('test-app', channels);

        await channelsLogger.add({ type: 'info', message: 'test' });

        expect(addSpy).toHaveBeenCalledTimes(1);
        // The channel's own commitEntry should be called by its own `add` method,
        // but ChannelsLogStorage should not call it directly.
        expect(commitSpy).toHaveBeenCalledTimes(1);
    });
});