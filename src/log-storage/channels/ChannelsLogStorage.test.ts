import { MemoryLogStorage } from "../memory/MemoryLogStorage.ts"
import { ChannelsLogStorage, type Channel } from "./ChannelsLogStorage.ts"

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { AcceptLogEntry, LogCallMaskingOptions, LogEntry } from '../types.ts';


/**
 * A hostile child that tries to grow the forwarded per-call directive IN PLACE before delegating, so a test
 * can prove the mutation can never reach a sibling (whether the facade defends by deep-freezing or by cloning
 * per child — both are valid per the design, so the test asserts the OUTCOME, not the mechanism).
 */
class PoisoningStorage extends MemoryLogStorage {
    override async add<C>(entry: AcceptLogEntry<C>, options?: LogCallMaskingOptions): Promise<LogEntry<C>> {
        try {
            options?.preserve_unmasked_context_paths?.push({ path: 'auth.token', shape: 'uuid' });
        } catch { /* a frozen array throws here — exactly the defense we want */ }
        return super.add(entry, options);
    }
}


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
            { storage: memoryLogger1, accept: { $nor: [{type: 'info' }]} }, // Everything BUT info
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


describe('ChannelsLogStorage: per-call unmasking propagation', () => {

    const UUID = '550e8400-e29b-41d4-a716-446655440000';
    const MASKED_UUID = '550....00';
    const directive: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] };
    const entryWithId: AcceptLogEntry = { type: 'info', message: 'm', context: { user: { id: UUID } } };

    it('fans a per-call directive out to every child, but each child honors it only if IT opted in', async () => {
        const flagged = new MemoryLogStorage('A', { allow_per_call_unmasking: true });
        const unflagged = new MemoryLogStorage('B'); // gate closed
        const channels = new ChannelsLogStorage('app', [{ storage: flagged }, { storage: unflagged }]);

        await channels.add(entryWithId, directive);

        const a = (await flagged.get())[0]!;
        const b = (await unflagged.get())[0]!;
        // The blessed child keeps the id readable…
        expect(a.context!.user.id).toBe(UUID);
        // …the un-blessed sibling masks it, even though the very same directive reached it…
        expect(b.context!.user.id).toBe(MASKED_UUID);
        // …and it is unmistakably the SAME log event (shared ulid), not two divergent writes.
        expect(a.ulid).toBe(b.ulid);
    });

    it('produces the same per-child outcome regardless of channel order (no cross-child contamination)', async () => {
        // Same two children, reversed order: the flagged one still unmasks, the unflagged one still masks.
        const flagged = new MemoryLogStorage('A', { allow_per_call_unmasking: true });
        const unflagged = new MemoryLogStorage('B');
        const channels = new ChannelsLogStorage('app', [{ storage: unflagged }, { storage: flagged }]);

        await channels.add(entryWithId, directive);

        expect((await flagged.get())[0]!.context!.user.id).toBe(UUID);
        expect((await unflagged.get())[0]!.context!.user.id).toBe(MASKED_UUID);
    });

    it('hands the directive to an un-blessed remote-like sink yet it is never honored there', async () => {
        // A webhook-like child (transforms/forwards entries off-box). Without its OWN flag it must stay masked,
        // even though the facade physically handed it the directive.
        const remote = new MemoryLogStorage('remote'); // gate closed
        const addSpy = vi.spyOn(remote, 'add');
        const channels = new ChannelsLogStorage('app', [{ storage: remote, transform: (e) => e }]);

        await channels.add(entryWithId, directive);

        // The directive DID arrive at the sink (a 2nd arg was passed)…
        expect(addSpy).toHaveBeenCalledTimes(1);
        expect(addSpy.mock.calls[0]![1]).toBeDefined();
        // …yet, un-blessed, the sink masked the id anyway.
        expect((await remote.get())[0]!.context!.user.id).toBe(MASKED_UUID);
    });

    it('forwards the directive to children without mutating or freezing the caller’s own object', async () => {
        const sink = new MemoryLogStorage('sink', { allow_per_call_unmasking: true });
        const channels = new ChannelsLogStorage('app', [{ storage: sink }]);

        const callerDirective: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] };
        await channels.add(entryWithId, callerDirective);

        // The blessed sink honored the forwarded directive…
        expect((await sink.get())[0]!.context!.user.id).toBe(UUID);
        // …and the caller's own object was never frozen or mutated (immutability of caller-owned input).
        expect(Object.isFrozen(callerDirective)).toBe(false);
        expect(callerDirective.preserve_unmasked_context_paths!.length).toBe(1);
    });

    it('prevents a poisoned child from making a sibling honor an injected path (no cross-child poisoning)', async () => {
        // The hostile child tries to push {path:'auth.token',shape:'uuid'} onto the shared directive before a
        // flagged sibling runs. auth.token holds a UUID-shaped value, so IF the injection took hold it would pass
        // the shape gate and leak — a masked token therefore proves the injection never reached the sibling.
        const poisoner = new PoisoningStorage('poison');
        const sibling = new MemoryLogStorage('sibling', { allow_per_call_unmasking: true });
        const channels = new ChannelsLogStorage('app', [{ storage: poisoner }, { storage: sibling }]);

        const callerDirective: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] };
        await channels.add({ type: 'info', message: 'm', context: { user: { id: UUID }, auth: { token: UUID } } }, callerDirective);

        const stored = (await sibling.get())[0]!;
        expect(stored.context!.auth.token).toBe(MASKED_UUID); // injected path NOT honored by the sibling
        expect(stored.context!.user.id).toBe(UUID);           // the legitimately-listed path still is
        expect(callerDirective.preserve_unmasked_context_paths!.length).toBe(1); // caller's array never grew
    });

    it('never exposes per-call options to a channel transform, nor lets them ride onto the stored entry', async () => {
        const sink = new MemoryLogStorage('sink', { allow_per_call_unmasking: true });
        let transformSawKeys: string[] = [];
        const channels = new ChannelsLogStorage('app', [{
            storage: sink,
            transform: (e) => { transformSawKeys = Object.keys(e); return e; },
        }]);

        await channels.add(entryWithId, directive);

        // The transform is handed the entry only — never the masking directive.
        expect(transformSawKeys).not.toContain('preserve_unmasked_context_paths');
        expect(transformSawKeys).not.toContain('allow_per_call_unmasking');
        // The directive WAS in effect (so this isn't trivially green)…
        const stored = (await sink.get())[0]!;
        expect(stored.context!.user.id).toBe(UUID);
        // …yet it never rode onto the persisted entry through the Channels path.
        const serialised = JSON.stringify(stored);
        expect(serialised).not.toContain('preserve_unmasked_context_paths');
        expect(serialised).not.toContain('allow_per_call_unmasking');
    });

    it('propagates the frozen directive through NESTED Channels to a deep flagged leaf', async () => {
        const deepLeaf = new MemoryLogStorage('leaf', { allow_per_call_unmasking: true });
        const inner = new ChannelsLogStorage('inner', [{ storage: deepLeaf }]);
        const outer = new ChannelsLogStorage('outer', [{ storage: inner }]);

        await outer.add(entryWithId, directive);

        // The directive survived two passthrough hops and the deep, blessed leaf honored it.
        expect((await deepLeaf.get())[0]!.context!.user.id).toBe(UUID);
    });

});

describe('ChannelsLogStorage: sensitive-data options are not part of the facade surface', () => {

    // The facade forwards entries untouched to its sub-storages (see the prepareContext override), so it
    // must not advertise data-unmasking escape hatches — callers configure preservation on the sub-storage
    // that actually masks. These are compile-time guards: vitest strips types, so only `tsc` enforces them.
    it('rejects preserve_unmasked_context_paths, permit_dangerous_context_properties, and allow_per_call_unmasking at construction', () => {
        const channels: Channel[] = [{ storage: new MemoryLogStorage('') }];

        // @ts-expect-error preserve_unmasked_context_paths is stripped from ChannelsLogStorage's options
        const withPreserve = new ChannelsLogStorage('ns', channels, { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] });

        // @ts-expect-error permit_dangerous_context_properties is likewise stripped
        const withDangerous = new ChannelsLogStorage('ns', channels, { permit_dangerous_context_properties: true });

        // @ts-expect-error allow_per_call_unmasking is a masking-config gate, meaningless on the non-masking facade
        const withPerCall = new ChannelsLogStorage('ns', channels, { allow_per_call_unmasking: true });

        // Construction still succeeds at runtime — the options are simply absent from the facade's surface.
        expect(withPreserve).toBeInstanceOf(ChannelsLogStorage);
        expect(withDangerous).toBeInstanceOf(ChannelsLogStorage);
        expect(withPerCall).toBeInstanceOf(ChannelsLogStorage);
    });
});