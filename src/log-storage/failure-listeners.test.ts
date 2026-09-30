import { describe, it, expect, onTestFinished } from 'vitest';
import { MemoryLogStorage } from './memory/MemoryLogStorage.ts';
import { createLoggingFailedResult } from '../failures/results.ts';
import type { LoggingError } from '../failures/types.ts';
import { recordUnhandledRejections } from './testing-helpers/recordUnhandledRejections.ts';

const spanFailure = () => createLoggingFailedResult({ source: 'Span', operation: 'unexpected', message: 'The log storage threw instead of answering.' }).error;

describe('an app listening for failures on the store it built', () => {

    it('hears a failure handed to the store, as the same object, once', () => {
        const storage = new MemoryLogStorage('my-app');
        const heard: LoggingError[] = [];
        storage.onFailure(error => { heard.push(error); });

        const error = spanFailure();
        storage.reportInternalFailure(error);

        expect(heard).toHaveLength(1);
        expect(heard[0]).toBe(error);
    });

    it('stops hearing failures once it unsubscribes', () => {
        const storage = new MemoryLogStorage('my-app');
        const heard: LoggingError[] = [];
        const unsubscribe = storage.onFailure(error => { heard.push(error); });

        storage.reportInternalFailure(spanFailure());
        unsubscribe();
        storage.reportInternalFailure(spanFailure());

        expect(heard).toHaveLength(1);
    });

    it('hears each failure once, even if it subscribed the same function twice', () => {
        const storage = new MemoryLogStorage('my-app');
        const heard: LoggingError[] = [];
        const listener = (error: LoggingError) => { heard.push(error); };
        storage.onFailure(listener);
        storage.onFailure(listener);

        storage.reportInternalFailure(spanFailure());

        expect(heard).toHaveLength(1);
    });

    it('does not hear a failure that happened before it subscribed', () => {
        const storage = new MemoryLogStorage('my-app');
        storage.reportInternalFailure(spanFailure());

        const heard: LoggingError[] = [];
        storage.onFailure(error => { heard.push(error); });

        expect(heard).toEqual([]);
    });

    it('hears only the failures of the store it subscribed to', () => {
        const storage = new MemoryLogStorage('my-app');
        const otherStorage = new MemoryLogStorage('other-app');
        const heard: LoggingError[] = [];
        storage.onFailure(error => { heard.push(error); });

        otherStorage.reportInternalFailure(spanFailure());

        expect(heard).toEqual([]);
    });
});

describe('a listener that breaks', () => {

    it('that throws is skipped: later listeners still hear the failure and the report returns normally', () => {
        const storage = new MemoryLogStorage('my-app');
        const heard: LoggingError[] = [];
        storage.onFailure(() => { throw new Error('listener bug'); });
        storage.onFailure(error => { heard.push(error); });

        const error = spanFailure();
        expect(() => storage.reportInternalFailure(error)).not.toThrow();

        expect(heard).toEqual([error]);
    });

    it('that rejects is skipped: later listeners still hear the failure and nothing is left unhandled', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new MemoryLogStorage('my-app');
        const heard: LoggingError[] = [];
        storage.onFailure(async () => { throw new Error('listener bug'); });
        storage.onFailure(error => { heard.push(error); });

        const error = spanFailure();
        storage.reportInternalFailure(error);

        expect(heard).toEqual([error]);
        expect(await unhandled.settled()).toEqual([]);
    });

    it('that returns a thenable whose then throws is skipped too', () => {
        const storage = new MemoryLogStorage('my-app');
        const heard: LoggingError[] = [];
        const hostileThenable = { get then(): never { throw new Error('hostile then'); } };
        // A listener's return type is void, so it may hand back anything, a hostile thenable included.
        storage.onFailure(() => hostileThenable);
        storage.onFailure(error => { heard.push(error); });

        const error = spanFailure();
        expect(() => storage.reportInternalFailure(error)).not.toThrow();

        expect(heard).toEqual([error]);
    });
});

describe('a listener that logs into the store it listens to', () => {

    it('does not hear a failure reported while it runs, so it cannot loop forever', () => {
        const storage = new MemoryLogStorage('my-app');
        let runs = 0;
        storage.onFailure(() => {
            runs++;
            storage.reportInternalFailure(spanFailure());
        });

        storage.reportInternalFailure(spanFailure());

        expect(runs).toBe(1);
    });

    it('hears the next failure reported after it returned', () => {
        const storage = new MemoryLogStorage('my-app');
        let runs = 0;
        storage.onFailure(() => {
            runs++;
            storage.reportInternalFailure(spanFailure());
        });

        storage.reportInternalFailure(spanFailure());
        storage.reportInternalFailure(spanFailure());

        expect(runs).toBe(2);
    });
});
