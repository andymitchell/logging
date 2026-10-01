import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WebhookLogStorage } from './WebhookLogStorage.ts';
import { FetchEmitter } from './testing-helpers/FetchEmitter.ts';

// Real timers throughout: a fake timer is no handle of the process, so counting them would prove nothing.

// A host that never resolves, so a retry that somehow slipped past the stub could reach nothing.
const POST_URL = 'https://hooks.invalid/log';

let interceptor: FetchEmitter;

beforeAll(() => {
    // One stub for the whole file, so a retry firing a second or two after its test still meets it.
    interceptor = new FetchEmitter();
    // The store prints each failed delivery; these tests count timers instead.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
    interceptor.restore();
    vi.restoreAllMocks();
});

/** How many timers the process holds that would keep Node running until they fire. Unref'd timers are not listed. */
const timersHoldingTheProcess = (): number => process.getActiveResourcesInfo().filter(type => type === 'Timeout').length;

describe('an app logging to a webhook from a Node program that then finishes', () => {

    it('can exit once it has made the store [dec-logging-never-holds-the-process-open]', () => {
        const before = timersHoldingTheProcess();

        new WebhookLogStorage('my-app', POST_URL);

        expect(timersHoldingTheProcess()).toBe(before);
    });

    it('can exit once its write has been delivered [dec-logging-never-holds-the-process-open]', async () => {
        interceptor.setResponse({ status: 200 });
        const before = timersHoldingTheProcess();
        const storage = new WebhookLogStorage('my-app', POST_URL);

        const result = await storage.add({ type: 'info', message: 'done' });

        expect(result.ok).toBe(true);
        expect(timersHoldingTheProcess()).toBe(before);
    });

    it('can exit while the store waits to retry a failed delivery [dec-logging-never-holds-the-process-open]', async () => {
        interceptor.setResponse({ status: 503 });
        const before = timersHoldingTheProcess();
        const storage = new WebhookLogStorage('my-app', POST_URL);

        const result = await storage.add({ type: 'critical', message: 'payments down' });

        expect(result.ok).toBe(false);
        expect(timersHoldingTheProcess()).toBe(before);

        // Let the retry deliver, so nothing is left pending when the file ends.
        const retried = new Promise<void>(resolve => interceptor.on('post', () => resolve()));
        interceptor.setResponse({ status: 200 });
        await retried;
    });

});
