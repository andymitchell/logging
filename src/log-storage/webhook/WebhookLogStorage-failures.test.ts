import { describe, it, expect, beforeEach, afterEach, onTestFinished, vi } from 'vitest';
import { WebhookLogStorage } from './WebhookLogStorage.ts';
import { FetchEmitter } from './testing-helpers/FetchEmitter.ts';
import { recordUnhandledRejections } from '../testing-helpers/recordUnhandledRejections.ts';
import { recordFailures } from '../testing-helpers/results.ts';
import type { LoggingFailure } from '../../failures/types.ts';

// Retries wait on timers, which each test moves on by hand.
vi.useFakeTimers();

const POST_URL = 'https://hooks.example.com/log';

let interceptor: FetchEmitter;

beforeEach(() => {
    interceptor = new FetchEmitter();
    // The store prints each failed delivery; these tests read the results instead.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    // Drop the retries each test's store scheduled, so none fires into a later test.
    vi.clearAllTimers();
    interceptor.restore();
    vi.restoreAllMocks();
});

/** The ulids of every entry the webhook has been sent, in order, counting each attempt. */
function recordDeliveries(): string[] {
    const sent: string[] = [];
    interceptor.on('post', payload => { sent.push(...payload.body.entries.map(entry => entry.ulid)); });
    return sent;
}

/** A failure of a write to the store in namespace `my-app`. */
const writeFailure = (message: string, details?: LoggingFailure['details']): LoggingFailure => ({
    source: 'WebhookLogStorage:my-app',
    operation: 'write',
    message,
    ...(details === undefined ? {} : { details }),
});

const UNREACHABLE = 'Could not reach the webhook. The entry is kept and will be retried.';


describe('an app whose webhook cannot be reached', () => {

    it('answers the write with a failure, and sends the entry once the webhook can be reached', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        interceptor.simulateNetworkError('getaddrinfo ENOTFOUND hooks.example.com');
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();

        const result = await storage.add({ type: 'error', message: 'payment failed' });
        interceptor.setResponse({ status: 200 });
        await vi.advanceTimersByTimeAsync(2_001);

        expect(result.ok).toBe(false);
        expect(result.error?.failures).toEqual([writeFailure(UNREACHABLE)]);
        expect(sent).toEqual([result.entry?.ulid, result.entry?.ulid]);
        expect(await unhandled.settled()).toEqual([]);
    });

    it('answers a write made while the store waits to retry with a failure, and sends its entry with the retry', async () => {
        interceptor.simulateNetworkError();
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();
        const first = await storage.add({ type: 'error', message: 'payment failed' });

        const second = await storage.add({ type: 'info', message: 'retrying' });
        interceptor.setResponse({ status: 200 });
        await vi.advanceTimersByTimeAsync(2_001);

        expect(second.error?.failures).toEqual([writeFailure('The entry is waiting to be sent while the webhook retries a failed delivery.')]);
        expect(sent).toEqual([first.entry?.ulid, first.entry?.ulid, second.entry?.ulid]);
    });

    it('leaves nothing unhandled and reports nothing more when a retry the store makes on its own fails', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        interceptor.simulateNetworkError();
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const failures = recordFailures(storage);
        const sent = recordDeliveries();

        const result = await storage.add({ type: 'error', message: 'payment failed' });
        await vi.advanceTimersByTimeAsync(2_001);

        expect(sent).toEqual([result.entry?.ulid, result.entry?.ulid]);
        expect(failures.heard).toEqual([result.error]);
        expect(await unhandled.settled()).toEqual([]);
    });
});


describe('an app whose webhook never answers', () => {

    it('answers the write with a failure once the webhook has had 10 seconds, and sends the entry again later', async () => {
        interceptor.simulateNoAnswer();
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();

        const pending = storage.add({ type: 'error', message: 'payment failed' });
        await vi.advanceTimersByTimeAsync(WebhookLogStorage.TIMEOUT_MS);
        const result = await pending;
        interceptor.setResponse({ status: 200 });
        await vi.advanceTimersByTimeAsync(2_001);

        expect(result.error?.failures).toEqual([writeFailure('The webhook did not answer within 10 seconds. The entry is kept and will be retried.')]);
        expect(sent).toEqual([result.entry?.ulid, result.entry?.ulid]);
    });
});


describe('an app whose webhook answers with an error', () => {

    it('answers a write the webhook asks to retry with a failure naming the status, and sends the entry again later', async () => {
        interceptor.setResponse({ status: 503 });
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();

        const result = await storage.add({ type: 'error', message: 'payment failed' });
        interceptor.setResponse({ status: 200 });
        await vi.advanceTimersByTimeAsync(2_001);

        expect(result.error?.failures).toEqual([writeFailure('The webhook answered with a temporary error. The entry is kept and will be retried.', { status: 503 })]);
        expect(sent).toEqual([result.entry?.ulid, result.entry?.ulid]);
    });

    it('answers a write the webhook refuses with a failure naming the status, discarding the entry and sending later ones', async () => {
        interceptor.setResponse({ status: 400, body: { error: 'invalid payload: {"email":"bob@example.com"}' } });
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();

        const refused = await storage.add({ type: 'error', message: 'payment failed' });
        interceptor.setResponse({ status: 200 });
        const later = await storage.add({ type: 'info', message: 'later' });
        await vi.advanceTimersByTimeAsync(60_000);

        expect(refused.error?.failures).toEqual([writeFailure('The webhook refused the entry, so it was discarded.', { status: 400 })]);
        expect(JSON.stringify(refused.error)).not.toContain('bob@example.com');
        expect(later.ok).toBe(true);
        expect(sent).toEqual([refused.entry?.ulid, later.entry?.ulid]);
    });

    it('answers every write whose entry was in a refused batch with the refusal, not only the first', async () => {
        interceptor.setResponse({ status: 400 });
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();

        const results = await Promise.all([storage.add({ type: 'info', message: 'first' }), storage.add({ type: 'info', message: 'second' })]);

        expect(sent).toEqual(results.map(result => result.entry?.ulid));
        expect(results.map(result => result.error?.failures)).toEqual([
            [writeFailure('The webhook refused the entry, so it was discarded.', { status: 400 })],
            [writeFailure('The webhook refused the entry, so it was discarded.', { status: 400 })],
        ]);
    });
});


describe('an app writing an entry that cannot be sent as JSON', () => {

    it('answers the write with a failure without sending it, and keeps sending later entries', async () => {
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();

        const unsendable = await storage.add({ type: 'info', message: 'counted', meta: { count: 10n } });
        const later = await storage.add({ type: 'info', message: 'later' });

        expect(unsendable.error?.failures).toEqual([writeFailure('Could not turn the entry into JSON, so it was not sent.')]);
        expect(later.ok).toBe(true);
        expect(sent).toEqual([later.entry?.ulid]);
    });
});
