import { QueueMemory } from "@andyrmitchell/utils/queue-memory";
import type { LogStorageOptions } from "../types.ts";
import { BaseLogStorage } from "../BaseLogStorage.ts";
import type { LogEntry, ILogStorage } from "../types.ts";
import { uid } from "@andyrmitchell/utils/uid";



export type PostBody = {
    entries: LogEntry[], 
    instanceId: string
}


/**
 * A logger that sends log entries to a remote webhook endpoint.
 * It buffers entries and sends them in batches, with exponential backoff on failure.
 * 
 * The endpoint should expect a POST of {entries: LogEntry[], instanceId: string}
 */
export class WebhookLogStorage extends BaseLogStorage implements ILogStorage {


    /**
     * The maximum number of log entries to send in a single batch.
     */
    static readonly MAX_BATCH_SIZE = 10;

    
    /**
     * Make sure fetch functions run sequentially in a guaranteed order
     */
    #queue = new QueueMemory('WebhookLogStorage');

    #callbackId?: NodeJS.Timeout | number

    /**
     * The webhook url to post to
     */
    #postUrl: string;

    /**
     * Useful for testing to track which instance of the class sent the fetch 
     */
    protected instanceId = uid();

    #bufferStorage: BufferStorage;


    constructor(dbNamespace: string, postUrl: string, options?: LogStorageOptions) {
        super(dbNamespace, options);


        this.#postUrl = postUrl;

        this.#bufferStorage = new BufferStorage();


    }


    protected override async commitEntry(logEntry: LogEntry): Promise<void> {



        await this.#bufferStorage.add(logEntry);
        await this.#flushBuffer();

    }


    async #flushBuffer(): Promise<void> {
        // Flush the buffer to the endpoint 
        await this.#queue.enqueue(async () => {
            const backOffUntil = await this.#bufferStorage.getBackOffUntil();
            if (Date.now() < backOffUntil.timestamp) {
                await this.#requestFutureFlushBuffer();
                return;
            }

            let buffer = await this.#bufferStorage.getBuffer();

            // Continue sending batches as long as there are items in the buffer
            while (buffer.length > 0) {
                const batch = buffer.slice(0, WebhookLogStorage.MAX_BATCH_SIZE);

                try {
                    const postBody:PostBody = {
                        entries: batch, 
                        instanceId: this.instanceId
                    };

                    const response = await fetch(this.#postUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify(postBody)
                    });

                    if (response.ok) {
                        // SUCCESS: Mark this batch as complete and continue.
                        await this.#bufferStorage.markComplete(batch.map(x => x.ulid));
                        buffer.splice(0, batch.length);

                    } else if (RETRYABLE_STATUSES.includes(response.status)) {
                        // TRANSIENT FAILURE: Back off and retry later.
                        console.warn(`WebhookLogStorage: Received retryable status ${response.status}. Backing off.`);
                        await this.#handleFailure();
                        break; // Stop processing batches and wait for the backoff period.

                    } else {
                        // PERMANENT FAILURE: Log the error and discard the batch to unblock the queue.
                        console.error(`WebhookLogStorage: Received non-retryable status ${response.status}. Discarding batch.`);
                        try {
                            const errorBody = await response.text();
                            console.error(`WebhookLogStorage: Error response body: ${errorBody}`);
                        } catch { /* Ignore if body can't be read */ }
                        
                        await this.#bufferStorage.markComplete(batch.map(x => x.ulid));
                        buffer.splice(0, batch.length); // Continue to the next batch
                    }

                } catch (error) {
                    console.error(`WebhookLogStorage: Fetch failed for URL ${this.#postUrl}. Backing off.`, error);
                    await this.#handleFailure();
                    // Break the loop and wait for the backoff period.
                    break;
                }
            }
        });
    }

    /**
     * Handles a failure by calculating and setting an exponential backoff,
     * and scheduling a future flush attempt.
     */
    async #handleFailure(): Promise<void> {
        const currentBackOff = await this.#bufferStorage.getBackOffUntil();
        const newAttempt = currentBackOff.attempt + 1;

        // Exponential backoff with jitter: 1s, 2s, 4s, 8s... + up to 1s random
        const delay = Math.pow(2, newAttempt - 1) * 1000 + (Math.random() * 1000);

        // Cap the delay at a reasonable maximum, e.g., 1 minute
        const maxDelay = 60 * 1000;
        const finalDelay = Math.min(delay, maxDelay);

        const newBackOff: BackOffUntil = {
            timestamp: Date.now() + finalDelay,
            attempt: newAttempt
        };

        await this.#bufferStorage.setBackOffUntil(newBackOff);
        this.#requestFutureFlushBuffer();
    }

    /**
     * Set up a callback to flush buffer a tick after the next paused timestamp. 
     */
    async #requestFutureFlushBuffer() {
        const backOffUntil = await this.#bufferStorage.getBackOffUntil();

        if (this.#callbackId) clearTimeout(this.#callbackId);

        const now = Date.now();
        if (backOffUntil.timestamp > now) {
            // Calculate remaining delay and set timeout
            const delay = backOffUntil.timestamp - now;
            this.#callbackId = setTimeout(() => this.#flushBuffer(), delay + 1); // +1ms to ensure timestamp has passed
        }
    }

}

/**
 * HTTP status codes that indicate a transient error and are safe to retry.
 */
const RETRYABLE_STATUSES:Readonly<number[]> = [
        429, // Too Many Requests
        500, // Internal Server Error
        502, // Bad Gateway
        503, // Service Unavailable
        504, // Gateway Timeout
    ];

type BackOffUntil = { timestamp: number, attempt: number };

/**
 * A storage mechanism for the items buffered to post. 
 * In theory it could have other implementations behind an interface, e.g. with more durable storage. 
 */
class BufferStorage {
    #buffer: LogEntry[] = []

    /**
     * Track back offs 
     */
    #backOffUntil: BackOffUntil = { timestamp: 0, attempt: 0 };

    constructor() {

    }

    async add(logEntry: LogEntry): Promise<void> {
        this.#buffer.push(logEntry);
    }

    async getBuffer(): Promise<LogEntry[]> {
        return [...this.#buffer];
    }

    async getBackOffUntil(): Promise<BackOffUntil> {
        return structuredClone(this.#backOffUntil);
    }


    async setBackOffUntil(backOff: BackOffUntil): Promise<void> {
        this.#backOffUntil = structuredClone(backOff);
    }

    async markComplete(entryUlids: string[]): Promise<void> {

        const deleteIds = new Set(entryUlids);
        this.#buffer = this.#buffer.filter(x => !deleteIds.has(x.ulid));

        this.#backOffUntil = { timestamp: 0, attempt: 0 };
    }


}