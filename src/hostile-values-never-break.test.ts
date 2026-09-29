import { describe, it, expect, onTestFinished, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from './log/Logger.ts';
import { Trace } from './trace/Trace.ts';
import type { ILogger } from './types.ts';
import { MemoryLogStorage } from './log-storage/memory/MemoryLogStorage.ts';
import { entryOf } from './log-storage/testing-helpers/results.ts';
import { recordUnhandledRejections } from './log-storage/testing-helpers/recordUnhandledRejections.ts';

class ErrorWithUnreadableMessage extends Error {
    override get message(): string { throw new Error('hostile message getter'); }
}

/** Values an app might log by accident that cannot be read, stringified or cloned normally. */
const hostileValues: [string, () => unknown][] = [
    ['a Proxy whose traps throw', () => new Proxy({}, {
        get() { throw new Error('trap'); },
        ownKeys() { throw new Error('trap'); },
        getPrototypeOf() { throw new Error('trap'); },
        getOwnPropertyDescriptor() { throw new Error('trap'); },
    })],
    ['a revoked Proxy', () => { const { proxy, revoke } = Proxy.revocable({}, {}); revoke(); return proxy; }],
    ['an object with a throwing getter', () => ({ get boom(): never { throw new Error('getter'); } })],
    ['an Error whose message getter throws', () => new ErrorWithUnreadableMessage()],
    ['a null-prototype object', () => Object.create(null)],
    ['a function', () => () => 1],
    ['a symbol', () => Symbol('s')],
    ['a bigint', () => 10n],
];

const loggers: [string, (storage: MemoryLogStorage) => ILogger][] = [
    ['a logger', storage => new Logger(storage)],
    ['a span', storage => new Trace(storage)],
];

describe.each(loggers)('%s on a healthy store, given a value it cannot read', (_name, build) => {

    // Stringifying some message values prints a diagnostic; it is not what these tests are about.
    beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });
    afterEach(() => { vi.restoreAllMocks(); });

    it.each(hostileValues)('records the entry when the message is %s', async (_label, value) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new MemoryLogStorage('my-app');
        const logger = build(storage);

        const entry = entryOf(await logger.warn(value()));

        expect(typeof entry.message).toBe('string');
        expect(await storage.get()).toContainEqual(entry);
        expect(await unhandled.settled()).toEqual([]);
    });

    it.each(hostileValues)('records the entry when the context is %s', async (_label, value) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new MemoryLogStorage('my-app');
        const logger = build(storage);

        const entry = entryOf(await logger.warn('hostile context', value()));

        expect(entry.message).toBe('hostile context');
        expect(await storage.get()).toContainEqual(entry);
        expect(await unhandled.settled()).toEqual([]);
    });
});
