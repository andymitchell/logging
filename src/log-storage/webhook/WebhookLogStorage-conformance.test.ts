import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLogStorageConformance } from "../../conformance/index.ts";
import { malformedAcceptEntries } from "../../conformance/helpers/fixtures.ts";
import { WebhookLogStorage } from "./WebhookLogStorage.ts";
import { FetchEmitter, type InterceptedPayload } from "./testing-helpers/FetchEmitter.ts";


const POST_URL = 'https://hooks.example.com/log';

let interceptor: FetchEmitter;

beforeEach(() => {
    // Every webhook call is answered by a fake server that accepts the batch.
    interceptor = new FetchEmitter();
});

afterEach(() => {
    interceptor.restore();
});


runLogStorageConformance(async ({ namespace, options }) => {
    const store = new WebhookLogStorage(namespace, POST_URL, options);
    return {
        capabilities: { substrate: { mode: 'none' }, migration: { mode: 'discards-old-entries', because: 'It sends entries on and keeps none.' } },
        instance: async () => store,
        dispose: async () => {},
    };
});


describe('a webhook store handed something that is not an entry', () => {

    it.each(malformedAcceptEntries())('never sends %s to the webhook', async (_label, entry) => {
        const posted: InterceptedPayload[] = [];
        interceptor.on('post', payload => { posted.push(payload); });
        const storage = new WebhookLogStorage('my-app', POST_URL);

        expect((await storage.add(entry)).ok).toBe(false);

        expect(posted).toEqual([]);
    });
});
