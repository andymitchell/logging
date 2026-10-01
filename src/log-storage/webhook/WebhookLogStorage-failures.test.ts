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
const TEMPORARY_ERROR = 'The webhook answered with a temporary error. The entry is kept and will be retried.';
const HELD_BACK = 'The entry is waiting to be sent while the webhook retries a failed delivery.';

/** One entry, written more than once with the same ulid (a replay, or two channels routing it to one store). */
const REPLAYED = { type: 'info' as const, message: 'replayed', ulid: '01J9ZZZZZZZZZZZZZZZZZZZZZZ' };


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


describe('an app whose entry is sent again after a failed attempt', () => {

    /** The `meta` of every entry the webhook has been sent, in order, counting each attempt. */
    function recordSentMeta(): unknown[] {
        const metas: unknown[] = [];
        interceptor.on('post', payload => { metas.push(...payload.body.entries.map(entry => entry.meta)); });
        return metas;
    }

    it('turns the entry into JSON once, however many attempts send it [dec-webhook-write-answers-for-its-own-entry]', async () => {
        let stringified = 0;
        const meta = { toJSON() { stringified++; return { note: 'x' }; } };
        interceptor.setResponse({ status: 503 });
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sentMeta = recordSentMeta();

        await storage.add({ type: 'info', message: 'x', meta });
        interceptor.setResponse({ status: 200 });
        await vi.advanceTimersByTimeAsync(2_001);

        expect(stringified).toBe(1);
        expect(sentMeta).toEqual([{ note: 'x' }, { note: 'x' }]);
    });

    it('sends the entry as it was written, even if the app has since changed the object [dec-webhook-write-answers-for-its-own-entry]', async () => {
        const meta = { step: 'as written' };
        interceptor.setResponse({ status: 503 });
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sentMeta = recordSentMeta();

        await storage.add({ type: 'info', message: 'x', meta });
        meta.step = 'changed afterwards';
        interceptor.setResponse({ status: 200 });
        await vi.advanceTimersByTimeAsync(2_001);

        expect(sentMeta).toEqual([{ step: 'as written' }, { step: 'as written' }]);
    });
});


describe('an app writing one entry twice at once (a replay, or two channels routing it to the same store)', () => {

    it('answers both writes with what became of the entry', async () => {
        interceptor.setResponse({ status: 200 });
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const entry = { type: 'info' as const, message: 'replayed', ulid: '01J9ZZZZZZZZZZZZZZZZZZZZZZ' };

        const results = await Promise.all([storage.add(entry), storage.add(entry)]);

        expect(results.map(result => result.error)).toEqual([undefined, undefined]);
    });

    it('sends the entry once, and answers both writes ok [dec-webhook-write-answers-for-its-own-entry]', async () => {
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();

        const results = await Promise.all([storage.add(REPLAYED), storage.add(REPLAYED)]);

        expect(sent).toEqual([REPLAYED.ulid]);
        expect(results.map(result => result.ok)).toEqual([true, true]);
    });

    it('answers both writes with a temporary error, and sends the entry once per attempt [dec-webhook-write-answers-for-its-own-entry]', async () => {
        interceptor.setResponse({ status: 503 });
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();

        const results = await Promise.all([storage.add(REPLAYED), storage.add(REPLAYED)]);
        interceptor.setResponse({ status: 200 });
        await vi.advanceTimersByTimeAsync(2_001);

        expect(results.map(result => result.error?.failures)).toEqual([
            [writeFailure(TEMPORARY_ERROR, { status: 503 })],
            [writeFailure(TEMPORARY_ERROR, { status: 503 })],
        ]);
        expect(sent).toEqual([REPLAYED.ulid, REPLAYED.ulid]);
    });
});


describe('an app writing one entry again later', () => {

    it('answers a write made while the store waits to retry as held back, and sends the entry once per attempt [dec-webhook-write-answers-for-its-own-entry]', async () => {
        interceptor.setResponse({ status: 503 });
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();

        const first = await storage.add(REPLAYED);
        const second = await storage.add(REPLAYED);
        const sentBeforeTheRetry = [...sent];
        interceptor.setResponse({ status: 200 });
        await vi.advanceTimersByTimeAsync(2_001);

        expect(first.error?.failures).toEqual([writeFailure(TEMPORARY_ERROR, { status: 503 })]);
        expect(second.error?.failures).toEqual([writeFailure(HELD_BACK)]);
        expect(sentBeforeTheRetry).toEqual([REPLAYED.ulid]);
        expect(sent).toEqual([REPLAYED.ulid, REPLAYED.ulid]);
    });

    it('sends the entry again when it is written again after it was sent: delivery is at least once [dec-webhook-write-answers-for-its-own-entry]', async () => {
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();

        const first = await storage.add(REPLAYED);
        const second = await storage.add(REPLAYED);

        expect([first.ok, second.ok]).toEqual([true, true]);
        expect(sent).toEqual([REPLAYED.ulid, REPLAYED.ulid]);
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

    it('answers the write with a failure without sending it when the entry turns itself into nothing [dec-webhook-write-answers-for-its-own-entry]', async () => {
        const storage = new WebhookLogStorage('my-app', POST_URL);
        const sent = recordDeliveries();
        const turnsIntoNothing = { type: 'info' as const, message: 'x', toJSON: () => undefined };

        const unsendable = await storage.add(turnsIntoNothing);
        const later = await storage.add({ type: 'info', message: 'later' });

        expect(unsendable.error?.failures).toEqual([writeFailure('Could not turn the entry into JSON, so it was not sent.')]);
        expect(later.ok).toBe(true);
        expect(sent).toEqual([later.entry?.ulid]);
    });
});


describe('an app whose webhook URL holds a secret, watching the console while delivery fails', () => {

    // A Slack or Discord webhook URL carries its token in the path. Assembled at run time, so the source never
    // holds anything shaped like a real one.
    const SECRET_URL = ['https://hooks.example.com/services', 'T0AB', 'B0CD', 'x'.repeat(24)].join('/');

    /** Everything the store printed to the console, as one string. */
    function printed(): string {
        return [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls].flat().map(String).join('\n');
    }

    function expectNothingPrintedOf(...secrets: string[]): void {
        const text = printed();
        for( const secret of [SECRET_URL, new URL(SECRET_URL).host, new URL(SECRET_URL).pathname, ...secrets] ) {
            expect(text).not.toContain(secret);
        }
    }

    it('prints only that the webhook could not be reached, not the URL or the error [dec-webhook-write-answers-for-its-own-entry]', async () => {
        const errorMessage = `getaddrinfo ENOTFOUND while connecting to ${SECRET_URL}`;
        interceptor.simulateNetworkError(errorMessage);
        const storage = new WebhookLogStorage('my-app', SECRET_URL);

        await storage.add({ type: 'error', message: 'payment failed' });

        expect(vi.mocked(console.error).mock.calls).toEqual([['WebhookLogStorage: Could not reach the webhook. Backing off.']]);
        expectNothingPrintedOf(errorMessage);
    });

    it('prints only that the webhook did not answer in time, not the URL or the error [dec-webhook-write-answers-for-its-own-entry]', async () => {
        interceptor.simulateNoAnswer();
        const storage = new WebhookLogStorage('my-app', SECRET_URL);

        const pending = storage.add({ type: 'error', message: 'payment failed' });
        await vi.advanceTimersByTimeAsync(WebhookLogStorage.TIMEOUT_MS);
        await pending;

        expect(vi.mocked(console.error).mock.calls).toEqual([['WebhookLogStorage: The webhook did not answer in time. Backing off.']]);
        expectNothingPrintedOf('AbortError');
    });

    it('prints only the status of a refusal, not the answer that echoes the entry [dec-webhook-write-answers-for-its-own-entry]', async () => {
        interceptor.setResponse({ status: 400, body: { error: 'invalid payload: {"email":"bob@example.com"}' } });
        const storage = new WebhookLogStorage('my-app', SECRET_URL);

        await storage.add({ type: 'error', message: 'payment failed', context: { email: 'bob@example.com' } });

        expect(vi.mocked(console.error).mock.calls).toEqual([['WebhookLogStorage: Received non-retryable status 400. Discarding batch.']]);
        expectNothingPrintedOf('bob@example.com', 'invalid payload');
    });

    it('prints only the status of a temporary error, not the answer [dec-webhook-write-answers-for-its-own-entry]', async () => {
        interceptor.setResponse({ status: 503, body: { error: 'overloaded while storing {"email":"bob@example.com"}' } });
        const storage = new WebhookLogStorage('my-app', SECRET_URL);

        await storage.add({ type: 'error', message: 'payment failed', context: { email: 'bob@example.com' } });

        expect(vi.mocked(console.warn).mock.calls).toEqual([['WebhookLogStorage: Received retryable status 503. Backing off.']]);
        expect(vi.mocked(console.error).mock.calls).toEqual([]);
        expectNothingPrintedOf('bob@example.com', 'overloaded');
    });
});


describe('an app whose webhook answers with a body that never finishes', () => {

    // An unread body holds its connection open, and in Node keeps the process running.

    it.each([200, 503, 400])('answers the write on the status alone (%i), and releases the body unread [dec-webhook-write-answers-for-its-own-entry]', async status => {
        let released = false;
        const neverFinishes = new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(new TextEncoder().encode('{"partial":')); },
            cancel() { released = true; },
        });
        vi.stubGlobal('fetch', async () => new Response(neverFinishes, { status }));
        const storage = new WebhookLogStorage('my-app', POST_URL);

        const result = await storage.add({ type: 'info', message: 'x' });

        expect(result.ok).toBe(status === 200);
        expect(released).toBe(true);
    });

    it('answers the write and leaves nothing unhandled when the body refuses to be released [dec-webhook-write-answers-for-its-own-entry]', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const refusesRelease = new ReadableStream<Uint8Array>({
            cancel() { throw new Error('the body will not be released'); },
        });
        vi.stubGlobal('fetch', async () => new Response(refusesRelease, { status: 200 }));
        const storage = new WebhookLogStorage('my-app', POST_URL);

        const result = await storage.add({ type: 'info', message: 'x' });

        expect(result.ok).toBe(true);
        expect(await unhandled.settled()).toEqual([]);
    });

    it('answers the write when the answer has no body at all [dec-webhook-write-answers-for-its-own-entry]', async () => {
        vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
        const storage = new WebhookLogStorage('my-app', POST_URL);

        const result = await storage.add({ type: 'info', message: 'x' });

        expect(result.ok).toBe(true);
    });
});
