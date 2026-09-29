// tests/helpers/FetchInterceptor.ts

import { vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Mock } from 'vitest';
import type { PostBody } from '../WebhookLogStorage.ts';

/**
 * The payload emitted by the interceptor when a POST request is caught.
 */
export interface InterceptedPayload {
    url: string;
    body: PostBody; // The JSON-parsed body of the request
    options: RequestInit; // The full options object passed to fetch
}

/**
 * A test helper to intercept global `fetch` calls within Vitest.
 * It's designed to capture POST request bodies and allow simulating
 * various server responses for testing network-dependent code.
 *
 * It emits a 'post' event with the InterceptedPayload whenever a fetch call is made.
 *
 * @example
 * let interceptor: FetchInterceptor;
 *
 * beforeEach(() => {
 *   interceptor = new FetchInterceptor();
 * });
 *
 * afterEach(() => {
 *   interceptor.restore();
 * });
 *
 * it('should capture the logger payload', async () => {
 *   const logger = new WebhookLogStorage(...);
 *   const captured = new Promise<InterceptedPayload>(res => {
 *      interceptor.on('post', payload => res(payload));
 *   });
 *
 *   logger.info('test message');
 *
 *   const payload = await captured;
 *   expect(payload.body.entries[0].message).toBe('test message');
 * });
 */
export class FetchEmitter {
    // The event emitter for notifying listeners of new requests
    private readonly emitter = new EventEmitter();

    // The Vitest mock function that replaces global.fetch
    private readonly mock: Mock;

    // Configuration for the mock response
    private responseConfig: { status: number; body: object } = {
        status: 200,
        body: { success: true },
    };

    // Flag to simulate a total network failure
    private networkError: Error | null = null;

    // Flag to simulate a server that never answers
    private noAnswer = false;

    constructor() {
        // This is the core of the interceptor. We create a mock function
        // that will be the new implementation of global.fetch.
        this.mock = vi.fn().mockImplementation(this.handleFetch);

        // Replace the global fetch with our mock implementation.
        vi.stubGlobal('fetch', this.mock);
    }

    /**
     * The actual function that handles the intercepted fetch call.
     */
    private handleFetch = async (
        url: string,
        options: RequestInit,
    ): Promise<Response> => {
        // First, emit the payload so listeners can react.
        // We parse the body to make it easier to assert against in tests.
        let parsedBody: unknown;
        try {
            parsedBody = options.body ? JSON.parse(options.body as string) : undefined;
        } catch (e) {
            parsedBody = options.body; // Fallback if not JSON
        }

        this.emitter.emit('post', {
            url,
            body: parsedBody,
            options,
        } as InterceptedPayload);

        // Check if we need to simulate a network error (e.g., DNS failure, no connection)
        if (this.networkError) {
            // Rejecting the promise simulates a network failure.
            return Promise.reject(this.networkError);
        }

        if (this.noAnswer) {
            // Like a real fetch, it settles only if the caller aborts it.
            return new Promise<Response>((_resolve, reject) => {
                const signal = options.signal;
                signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
            });
        }

        // Otherwise, simulate a server response based on the current configuration.
        const response = new Response(JSON.stringify(this.responseConfig.body), {
            status: this.responseConfig.status,
            headers: { 'Content-Type': 'application/json' },
        });

        return Promise.resolve(response);
    };

    /**
     * Registers a listener for the 'post' event.
     * The listener will be called with the InterceptedPayload
     * every time the mocked fetch is called.
     */
    public on(event: 'post', listener: (payload: InterceptedPayload) => void): void {
        this.emitter.on(event, listener);
    }

    /**
     * Configures the mock response that fetch will return.
     * @param {object} config
     * @param {number} config.status - The HTTP status code to return (e.g., 200, 503).
     * @param {object} [config.body={}] - The JSON body to return.
     */
    public setResponse({ status, body = {} }: { status: number; body?: object }): void {
        // When setting a valid response, ensure we're not also simulating a network error or silence.
        this.networkError = null;
        this.noAnswer = false;
        this.responseConfig = { status, body };
    }

    /**
     * Configures the mock to simulate a network error, causing the fetch promise to reject.
     * @param {string} [message='Network request failed'] - The error message.
     */
    public simulateNetworkError(message = 'Network request failed'): void {
        this.noAnswer = false;
        this.networkError = new Error(message);
    }

    /**
     * Configures the mock to simulate a server that never answers: each fetch stays pending until the caller
     * aborts it through its `signal`, then rejects with the signal's reason.
     */
    public simulateNoAnswer(): void {
        this.networkError = null;
        this.noAnswer = true;
    }

    /**
     * Restores the original global `fetch` function.
     * CRITICAL to call this in an `afterEach` block to ensure test isolation.
     */
    public restore(): void {
        vi.unstubAllGlobals();
        this.emitter.removeAllListeners();
    }

    /**
     * Returns the mock function itself for advanced assertions if needed.
     * For example: `expect(interceptor.getMock()).toHaveBeenCalledTimes(1);`
     */
    public getMock(): Mock {
        return this.mock;
    }
}