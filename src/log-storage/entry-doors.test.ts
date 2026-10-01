import { describe, it, expect, onTestFinished, vi } from 'vitest';
import { MemoryLogStorage } from './memory/MemoryLogStorage.ts';
import { MemoryBreakpoints } from '../breakpoints/MemoryBreakpoints.ts';
import type { AcceptLogEntry, LogEntry } from './types.ts';
import { entriesOf, entryOf, recordFailures } from './testing-helpers/results.ts';
import { recordUnhandledRejections } from './testing-helpers/recordUnhandledRejections.ts';


/** Entries a JavaScript caller (or a cast) can hand to `add` that are not log entries. */
function malformedEntries(): [label: string, entry: AcceptLogEntry][] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- entries the type forbids are what is under test
    const asAccepted = (entry: Record<string, unknown>): AcceptLogEntry => entry as any;
    return [
        ['a message that is a number', asAccepted({ type: 'info', message: 42 })],
        ['an unknown type', asAccepted({ type: 'shout', message: 'secret-shaped-value' })],
        ['a message that is an object', asAccepted({ type: 'info', message: { text: 'secret-shaped-value' } })],
    ];
}


describe('an app that hands a store something that is not an entry', () => {

    describe('adding it', () => {

        it.each(malformedEntries())('fails the write of %s, records nothing, and tells the listeners once', async (_label, entry) => {
            const unhandled = recordUnhandledRejections();
            onTestFinished(unhandled.stop);
            const storage = new MemoryLogStorage('my-app');
            const failures = recordFailures(storage);

            const result = await storage.add(entry);

            expect(result.ok).toBe(false);
            expect(result.entry).toBeUndefined();
            expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'write', message: 'The entry is not a valid log entry.' }]);
            expect(failures.heard).toHaveLength(1);
            expect(failures.heard[0]).toBe(result.error);
            expect(await storage.get()).toEqual({ ok: true, entries: [] });
            expect(await unhandled.settled()).toEqual([]);
        });

        it.each(malformedEntries())('never quotes the entry in the failure, given %s', async (_label, entry) => {
            const result = await new MemoryLogStorage('my-app').add(entry);

            expect(JSON.stringify(result.error)).not.toContain('secret-shaped-value');
        });

        it('neither echoes it to the console nor checks it against breakpoints', async () => {
            const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
            onTestFinished(() => consoleLog.mockRestore());
            const breakpointHits: unknown[] = [];
            const breakpoints = new MemoryBreakpoints();
            breakpoints.setHandler(entry => { breakpointHits.push(entry); });
            await breakpoints.addBreakpoint({ type: 'info' });
            const storage = new MemoryLogStorage('my-app', { log_to_console: true, breakpoints });
            const [[, malformed]] = malformedEntries() as [[string, AcceptLogEntry]];

            await storage.add(malformed);
            const valid = entryOf(await storage.add({ type: 'info', message: 'fine' }));

            expect(consoleLog.mock.calls.map(([line]) => line)).toEqual(['[Log my-app] fine']);
            expect(breakpointHits).toEqual([valid]);
        });

        it('still records an entry whose context cannot be read, masked rather than rejected', async () => {
            const storage = new MemoryLogStorage('my-app');
            const unreadable = new Proxy({}, {
                get() { throw new Error('trap'); },
                ownKeys() { throw new Error('trap'); },
                getPrototypeOf() { throw new Error('trap'); },
                getOwnPropertyDescriptor() { throw new Error('trap'); },
            });

            const result = await storage.add({ type: 'warn', message: 'hostile context', context: unreadable });

            expect(result.ok).toBe(true);
            expect(entriesOf(await storage.get())).toEqual([result.entry]);
        });
    });

    describe('resetting the store to it', () => {

        /** A store holding two valid entries, and what a read of it returns. */
        async function storeHoldingTwoEntries() {
            const storage = new MemoryLogStorage('my-app');
            await storage.add({ type: 'info', message: 'first' });
            await storage.add({ type: 'info', message: 'second' });
            return { storage, before: entriesOf(await storage.get()) };
        }

        it.each<[string, Record<string, unknown>]>([
            ['a message that is a number', { message: 42 }],
            ['an unknown type', { type: 'shout' }],
            ['no ulid', { ulid: undefined }],
            ['a format version from a newer library', { format_version: 3 }],
        ])('fails the whole reset when one entry has %s, leaving the store unchanged, and tells the listeners once', async (_label, flaw) => {
            const { storage, before } = await storeHoldingTwoEntries();
            const failures = recordFailures(storage);
            const valid = entryOf(await new MemoryLogStorage('elsewhere').add({ type: 'info', message: 'valid' }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- an entry the type forbids is what is under test
            const entries: LogEntry[] = [valid, { ...valid, ...flaw } as any];

            const result = await storage.reset(entries);

            expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'reset', message: 'Some entries are not valid log entries.' }]);
            expect(failures.heard).toHaveLength(1);
            expect(failures.heard[0]).toBe(result.error);
            expect(entriesOf(await storage.get())).toEqual(before);
        });

        it('fails for an entry written before entries were versioned: it must be migrated first', async () => {
            const { storage, before } = await storeHoldingTwoEntries();
            const { format_version: _dropped, ...unversioned } = entryOf(await new MemoryLogStorage('elsewhere').add({ type: 'info', message: 'old' }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- an entry the type forbids is what is under test
            const entries: LogEntry[] = [unversioned as any];

            const result = await storage.reset(entries);

            expect(result.error?.failures.map(failure => failure.message)).toEqual(['Some entries are not valid log entries.']);
            expect(entriesOf(await storage.get())).toEqual(before);
        });

        it.each<[string, unknown]>([
            ['a single entry rather than an array', { type: 'info', message: 'x' }],
            ['null', null],
            ['a string', 'entries'],
            ['an array with a gap where an entry should be', Object.assign([], { length: 1 })],
            ['a revoked Proxy', (() => { const { proxy, revoke } = Proxy.revocable([], {}); revoke(); return proxy; })()],
        ])('fails when handed %s, leaving the store unchanged and nothing unhandled', async (_label, notAnArray) => {
            const unhandled = recordUnhandledRejections();
            onTestFinished(unhandled.stop);
            const { storage, before } = await storeHoldingTwoEntries();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a value the type forbids is what is under test
            const result = await storage.reset(notAnArray as any);

            expect(result.error?.failures.map(failure => failure.message)).toEqual(['Some entries are not valid log entries.']);
            expect(entriesOf(await storage.get())).toEqual(before);
            expect(await unhandled.settled()).toEqual([]);
        });

        it('clears the store when handed nothing', async () => {
            const { storage } = await storeHoldingTwoEntries();

            expect(await storage.reset()).toEqual({ ok: true });
            expect(entriesOf(await storage.get())).toEqual([]);
        });
    });
});
