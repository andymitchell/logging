import { QueueMemory } from "@andymitchell/utils/queue-memory";
import type { LogStorageOptions } from "../types.ts";
import { BaseLogStorage } from "../BaseLogStorage.ts";
import type { LogEntry, ILogStorage } from "../types.ts";
import { uid } from "@andymitchell/utils/uid";
import type { LogReadResult, LoggingFailure, LoggingResult } from "../../failures/types.ts";
import { createLoggingFailedResult, ok } from "../../failures/results.ts";



export type PostBody = {
    entries: LogEntry[], 
    instanceId: string
}


/**
 * A logger that sends log entries to a remote webhook endpoint.
 * It buffers entries and sends them in batches, with exponential backoff on failure.
 *
 * The endpoint should expect a POST of {entries: LogEntry[], instanceId: string}
 *
 * A write resolves once its own entry has been sent, or once sending it has failed. It resolves `{ ok: true }`
 * when the webhook accepted the entry (a 2xx answer), and otherwise `{ ok: false, error }` saying why:
 * - The webhook could not be reached, or did not answer within {@link WebhookLogStorage.TIMEOUT_MS}.
 * - It answered with a temporary error (429 or 5xx); the failure's `details` are `{ status }`.
 * - It refused the entry (any other status, also `{ status }`). A refused entry is discarded.
 * - The store is waiting to retry an earlier failed delivery, so the entry has not been tried yet.
 * - The entry cannot be turned into JSON (e.g. a bigint in `meta`), so it is never sent.
 *
 * Except when refused or not JSON, the entry is kept and sent again once the back-off has passed. A retry the
 * store makes on its own has no caller, so it is not reported; the next write's result says how delivery is
 * going. A failure never quotes the webhook's answer, which can echo the data that was sent.
 *
 * Each failed delivery also prints one console line, saying only what happened and, when the webhook answered,
 * its HTTP status (e.g. `WebhookLogStorage: Could not reach the webhook. Backing off.`). It never carries the
 * webhook's URL (a Slack or Discord URL holds its token in the path), the caught error, or the answer's body.
 * The store reads only the status of an answer and releases its body unread, so a long or never-ending body
 * neither delays the write nor holds a connection open.
 *
 * Entries are sent on, not kept: `get` resolves `{ ok: true, entries: [] }`, and `reset` and
 * `forceClearOldEntries` resolve `{ ok: true }`.
 *
 * @example
 * const storage = new WebhookLogStorage('my-app', 'https://hooks.example.com/log');
 * const result = await storage.add({ type: 'critical', message: 'payments down' });
 * if (result.error) report(result.error);
 * // e.g. failures: [{ source: 'WebhookLogStorage:my-app', operation: 'write', message: 'The webhook answered with a temporary error. …', details: { status: 503 } }]
 */
export class WebhookLogStorage extends BaseLogStorage implements ILogStorage {


    /**
     * The maximum number of log entries to send in a single batch.
     */
    static readonly MAX_BATCH_SIZE = 10;

    /**
     * How long to wait for the webhook to answer a batch before giving up on that attempt, in milliseconds.
     */
    static readonly TIMEOUT_MS = 10_000;

    protected override readonly storeName: string = 'WebhookLogStorage';

    /**
     * One record per write still waiting on its entry's delivery, filled in with what became of the entry once
     * its batch was tried. Kept per write, not per ulid, because one entry can be written twice at once.
     */
    #awaitedDeliveries = new Set<AwaitedDelivery>();

    
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


    /**
     * @param dbNamespace Appears in the `source` of the store's failures.
     * @param postUrl The webhook each batch is POSTed to.
     * @param options How entries are masked, and more; see {@link LogStorageOptions}.
     */
    constructor(dbNamespace: string, postUrl: string, options?: LogStorageOptions) {
        super(dbNamespace, options);


        this.#postUrl = postUrl;

        this.#bufferStorage = new BufferStorage();


    }


    protected override async commitEntry(logEntry: LogEntry): Promise<LoggingResult> {
        // Checked before the entry joins the buffer: one that cannot be sent as JSON would fail every batch it
        // was in, holding back every entry behind it for good.
        if( !isSendableAsJson(logEntry) ) return createLoggingFailedResult(this.#writeFailure(NOT_JSON));

        const awaited: AwaitedDelivery = { ulid: logEntry.ulid };
        this.#awaitedDeliveries.add(awaited);
        try {
            await this.#bufferStorage.add(logEntry);
            await this.#flushBuffer();
            return awaited.result ?? createLoggingFailedResult(this.#writeFailure(HELD_BACK));
        } finally {
            this.#awaitedDeliveries.delete(awaited);
        }
    }

    #writeFailure(message: string, details?: { status: number }): LoggingFailure {
        return { ...this.toFailure('write', undefined), message, ...(details ? { details } : {}) };
    }

    /**
     * Record what became of each entry in `batch` that a write is waiting on.
     */
    #settle(batch: LogEntry[], delivery: Delivery): void {
        const result = this.#resultOf(delivery);
        const tried = new Set(batch.map(entry => entry.ulid));
        for( const awaited of this.#awaitedDeliveries ) {
            if( tried.has(awaited.ulid) ) awaited.result = result;
        }
    }

    #resultOf(delivery: Delivery): LoggingResult {
        switch( delivery.kind ) {
            case 'sent': return ok();
            case 'unreachable': return createLoggingFailedResult(this.#writeFailure(UNREACHABLE));
            case 'timed_out': return createLoggingFailedResult(this.#writeFailure(TIMED_OUT));
            case 'retry': return createLoggingFailedResult(this.#writeFailure(TEMPORARY_ERROR, { status: delivery.status }));
            case 'refused': return createLoggingFailedResult(this.#writeFailure(REFUSED, { status: delivery.status }));
        }
    }

    // Entries are sent on, not kept, so there is nothing to clear, reset or read.

    protected override async clearOldEntries(): Promise<LoggingResult> {
        return ok();
    }

    protected override async resetEntries(): Promise<LoggingResult> {
        return ok();
    }

    protected override async queryEntries<T extends LogEntry = LogEntry>(): Promise<LogReadResult<T>> {
        return { ok: true, entries: [] };
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
                const delivery = await this.#send(batch);
                this.#settle(batch, delivery);

                if (delivery.kind === 'sent' || delivery.kind === 'refused') {
                    // Sent, or discarded so a batch the webhook will never accept does not block the queue.
                    await this.#bufferStorage.markComplete(batch.map(x => x.ulid));
                    buffer.splice(0, batch.length);
                } else {
                    // Stop processing batches and wait for the backoff period.
                    await this.#handleFailure();
                    break;
                }
            }
        });
    }

    /**
     * POST one batch, giving up if the webhook has not answered within {@link WebhookLogStorage.TIMEOUT_MS}.
     *
     * @returns What became of the batch. Never rejects.
     */
    async #send(batch: LogEntry[]): Promise<Delivery> {
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, WebhookLogStorage.TIMEOUT_MS);
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
                body: JSON.stringify(postBody),
                signal: controller.signal
            });
            releaseBody(response);

            if (response.ok) return { kind: 'sent' };

            if (RETRYABLE_STATUSES.includes(response.status)) {
                // TRANSIENT FAILURE: Back off and retry later.
                console.warn(`WebhookLogStorage: Received retryable status ${response.status}. Backing off.`);
                return { kind: 'retry', status: response.status };
            }

            // PERMANENT FAILURE: Log the error and discard the batch to unblock the queue.
            console.error(`WebhookLogStorage: Received non-retryable status ${response.status}. Discarding batch.`);
            return { kind: 'refused', status: response.status };

        } catch {
            // Neither the URL (a Slack or Discord URL holds its token in the path) nor the caught error (which can
            // quote the URL) is printed: console output is often collected where secrets must not go.
            console.error(timedOut
                ? 'WebhookLogStorage: The webhook did not answer in time. Backing off.'
                : 'WebhookLogStorage: Could not reach the webhook. Backing off.');
            return { kind: timedOut ? 'timed_out' : 'unreachable' };
        } finally {
            clearTimeout(timer);
        }
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
        await this.#requestFutureFlushBuffer();
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
            // No call waits on this retry, so no result can carry its outcome and a failure is ignored; the next
            // write's result says how delivery is going.
            this.#callbackId = setTimeout(() => { this.#flushBuffer().catch(() => {}); }, delay + 1); // +1ms to ensure timestamp has passed
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
 * A write waiting on its entry's delivery, and what became of the entry once its batch was tried.
 */
type AwaitedDelivery = { readonly ulid: string, result?: LoggingResult };

/**
 * What became of one attempt to send a batch.
 */
type Delivery =
    | { kind: 'sent' }
    | { kind: 'unreachable' }
    | { kind: 'timed_out' }
    | { kind: 'retry', status: number }
    | { kind: 'refused', status: number };

const UNREACHABLE = 'Could not reach the webhook. The entry is kept and will be retried.';
const TIMED_OUT = `The webhook did not answer within ${WebhookLogStorage.TIMEOUT_MS / 1000} seconds. The entry is kept and will be retried.`;
const TEMPORARY_ERROR = 'The webhook answered with a temporary error. The entry is kept and will be retried.';
const REFUSED = 'The webhook refused the entry, so it was discarded.';
const HELD_BACK = 'The entry is waiting to be sent while the webhook retries a failed delivery.';
const NOT_JSON = 'Could not turn the entry into JSON, so it was not sent.';

/**
 * Let go of a webhook's answer without reading its body.
 *
 * The store acts on the status alone. A body that is never read or cancelled holds its connection open, and in
 * Node keeps the process running, so every answer's body is cancelled as soon as it arrives.
 *
 * @param response The webhook's answer. Its body may be absent (e.g. a 204).
 *
 * @remarks
 * Never throws and never waits: a body that is slow to cancel cannot delay the write, and one that refuses to
 * cancel leaves no unhandled rejection. A connection whose body was still arriving is closed rather than reused.
 */
function releaseBody(response: Response): void {
    try {
        // Not awaited: a body that is slow to cancel must not delay the write.
        response.body?.cancel().catch(() => {});
    } catch {
        // A body that is already locked or released holds nothing more to let go of.
    }
}

function isSendableAsJson(entry: LogEntry): boolean {
    try {
        JSON.stringify(entry);
        return true;
    } catch {
        return false;
    }
}

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