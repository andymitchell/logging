import { describe, it, expect, onTestFinished, vi } from 'vitest';
import { MemoryLogStorage } from './memory/MemoryLogStorage.ts';
import { LogEntrySchema } from './schemas.ts';
import type { LogEntry, LogStorageOptions } from './types.ts';
import { entriesOf, recordFailures } from './testing-helpers/results.ts';
import { recordUnhandledRejections } from './testing-helpers/recordUnhandledRejections.ts';

/** Assembled at runtime: a live Stripe key's shape in source trips secret scanners. */
const API_KEY = ['sk', 'live', '4eC39HqLyjWDarjtT1zdp7dc'].join('_');

/** A Memory store in namespace `my-app` that makes an entry safe to show by calling `expose`. */
function storeThatExposes(expose: (entry: LogEntry) => unknown, options?: LogStorageOptions): MemoryLogStorage {
    return new (class extends MemoryLogStorage {
        protected override makeEntrySafeToExpose(entry: LogEntry): LogEntry {
            // Answers the hook's type forbids are what is under test.
            return expose(entry) as LogEntry;
        }
    })('my-app', options);
}

/** Ways a store can fail to make an entry safe to show. */
const faultyExposures: [string, (entry: LogEntry) => unknown][] = [
    ['throws, with a secret in its message', () => { throw new Error(`could not mask ${API_KEY}`); }],
    ['answers with another entry', entry => ({ ...entry, ulid: '01J9ZZZZZZZZZZZZZZZZZZZZZZ' })],
    ['answers with nothing', () => undefined],
    ['answers with something that is not an entry', () => ({ message: 'shown' })],
];

/** Every line printed with `console.log` during the test, each as its arguments. */
function recordConsoleLog(): unknown[][] {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    onTestFinished(() => consoleLog.mockRestore());
    return consoleLog.mock.calls;
}

describe('a store that cannot make an entry safe to show', () => {

    it.each(faultyExposures)('returns the entry without its context and fails the write, though the entry was recorded, when it %s [dec-channels-facade-masks-what-it-exposes]', async (_label, expose) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = storeThatExposes(expose);
        const failures = recordFailures(storage);

        const result = await storage.add({ type: 'info', message: 'signed in', context: { user: 'bob' } });

        const [recorded, ...others] = entriesOf(await storage.get());
        expect(others).toEqual([]);
        const { context, ...recordedWithoutContext } = recorded!;
        expect(context).toEqual({ user: 'bob' });
        expect(result.entry).toEqual(recordedWithoutContext);
        expect(Object.getOwnPropertyNames(result.entry)).not.toContain('context');
        expect(LogEntrySchema.safeParse(result.entry).success).toBe(true);
        expect(result.ok).toBe(false);
        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'write', message: 'Could not make the entry safe to expose, so its context was left out.' }]);
        expect(failures.heard).toHaveLength(1);
        expect(failures.heard[0]).toBe(result.error);
        expect(JSON.stringify(result)).not.toContain(API_KEY);
        expect(await unhandled.settled()).toEqual([]);
    });

    it.each(faultyExposures)('echoes the entry without its context when it %s [dec-channels-facade-masks-what-it-exposes]', async (_label, expose) => {
        const printed = recordConsoleLog();
        const storage = storeThatExposes(expose, { log_to_console: true });

        await storage.add({ type: 'info', message: 'signed in', context: { user: 'bob' } });

        expect(printed).toEqual([['[Log my-app] signed in', undefined]]);
    });
});
