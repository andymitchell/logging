// WebhookLogStorage.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebhookLogStorage } from './WebhookLogStorage.ts'; // Adjust path
import { FetchEmitter, type InterceptedPayload } from './testing-helpers/FetchEmitter.ts';


// Use fake timers to control setTimeout for backoff tests
vi.useFakeTimers();

describe('WebhookLogStorage', () => {
    const POST_URL = 'https://api.example.com/log';
    let interceptor: FetchEmitter;

    beforeEach(() => {
        // Set up the interceptor before each test
        interceptor = new FetchEmitter();
    });

    afterEach(() => {
        // Restore the original fetch after each test
        interceptor.restore();
        // Clear any pending timers
        vi.clearAllMocks();
    });

    it('should send a single log entry to the webhook', async () => {
        // Arrange
        const logger = new WebhookLogStorage('test-ns', POST_URL);
        const captured = new Promise<InterceptedPayload>(resolve => {
            interceptor.on('post', payload => resolve(payload));
        });

        // Act
        logger.add({type: 'info', message: 'Hello, World!', context: { userId: 'user-123' }});

        // Assert
        const payload = await captured;

        expect(payload.url).toBe(POST_URL);
        expect(payload.body.entries).toHaveLength(1);
        expect(payload.body.entries[0]).toMatchObject({
            type: 'info',
            message: 'Hello, World!',
            context: { userId: 'user-123' },
        });
        expect(payload.body.instanceId).toBeDefined();
    });

    it('should batch multiple log entries up to MAX_BATCH_SIZE', async () => {
        // Arrange
        const logger = new WebhookLogStorage('test-ns', POST_URL);
        let capturedPayload: InterceptedPayload | undefined;
        interceptor.on('post', payload => (capturedPayload = payload));

        // Act
        // Log one more than the max batch size
        for (let i = 0; i < WebhookLogStorage.MAX_BATCH_SIZE + 1; i++) {
            logger.add({type: 'info', message: `Log ${i}`});
        }

        // Assert: Wait for the async flush to complete
        await vi.waitFor(() => {
            expect(interceptor.getMock()).toHaveBeenCalledTimes(2);
        });

        // The second call's payload should be the last one we check
        expect(capturedPayload!.body.entries).toHaveLength(1);
        expect(capturedPayload!.body.entries[0]!.message).toBe(`Log ${WebhookLogStorage.MAX_BATCH_SIZE}`);
    });


    it('should retry on retryable status codes (e.g., 503)', async () => {
        // Arrange
        interceptor.setResponse({ status: 503 }); // Service Unavailable
        const logger = new WebhookLogStorage('test-ns', POST_URL);

        let callCount = 0;
        interceptor.on('post', () => { callCount++ });

        // Act
        logger.add({type: 'error', message: 'This should fail and retry'})

        // Assert: First call happens immediately
        await vi.waitFor(() => expect(callCount).toBe(1));

        // Now, simulate success on the next attempt
        interceptor.setResponse({ status: 200 });

        // Advance time past the first backoff delay (2^0 * 1000ms + jitter)
        await vi.advanceTimersByTimeAsync(1500);

        // The retry should have been triggered
        await vi.waitFor(() => expect(callCount).toBe(2));
    });

    it('should discard batch on permanent failure (e.g., 400)', async () => {
        // Arrange
        interceptor.setResponse({ status: 400 }); // Bad Request
        const logger = new WebhookLogStorage('test-ns', POST_URL);
        const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => { });

        let callCount = 0;
        interceptor.on('post', () => { callCount++ });

        // Act
        logger.add({type: 'warn', message: 'This will be discarded'});
        logger.add({type: 'info', message: 'This should be sent in a new batch'});

        // Assert
        await vi.waitFor(() => {
            expect(callCount).toBe(1);
        });

        expect(mockConsoleError).toHaveBeenCalledWith(
            expect.stringContaining('Received non-retryable status 400')
        );
        mockConsoleError.mockRestore();
    });

    it('should back off on network failure', async () => {
        // Arrange
        interceptor.simulateNetworkError('Failed to connect');
        const logger = new WebhookLogStorage('test-ns', POST_URL);

        let callCount = 0;
        interceptor.on('post', () => { callCount++ });

        // Act
        logger.add({type: 'info', message: 'A log that will fail'});

        // Assert: Wait for the first failed attempt
        await vi.waitFor(() => expect(callCount).toBe(1));

        // No more calls should happen until the timer is advanced
        await vi.advanceTimersByTimeAsync(500);
        expect(callCount).toBe(1);

        // Simulate network recovery and advance past the backoff period
        interceptor.setResponse({ status: 200 });
        await vi.advanceTimersByTimeAsync(1000);

        // The retry should have happened
        await vi.waitFor(() => expect(callCount).toBe(2));
    });
});