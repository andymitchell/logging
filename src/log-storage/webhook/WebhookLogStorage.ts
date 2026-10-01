import type { LogStorageOptions } from "../types.ts";
import { BaseLogStorage } from "../BaseLogStorage.ts";
import type { LogEntry, ILogStorage } from "../types.ts";
import { uid } from "@andymitchell/utils/uid";
import type { LogReadResult, LoggingFailure, LoggingResult } from "../../failures/types.ts";
import { createLoggingFailedResult, ok } from "../../failures/results.ts";



/**
 * The JSON body of each POST to the webhook: a batch of entries, and the id of the store instance that sent it.
 */
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
 * Each entry is turned into JSON once, when it is written, and every attempt sends that text, so a retry sends
 * the entry as it was written. An entry already waiting to be sent (same `ulid`) is not buffered again: a replay,
 * or two channels routing one entry here, sends it once, and every write waiting on it gets that attempt's
 * answer. An entry written again after it was sent is sent again: delivery is at least once.
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
 *
 * @remarks
 * A retry that is waiting never keeps a Node process running: a program that has finished its own work exits,
 * and entries still in the buffer then are lost, since they only ever lived in memory. Await the write to learn
 * whether its entry was delivered. An attempt already in flight holds the process until the webhook answers or
 * {@link WebhookLogStorage.TIMEOUT_MS} passes.
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
     * The latest flush. Each starts when the one before has finished, so batches are sent one at a time, in call
     * order.
     */
    #flushing: Promise<void> = Promise.resolve();

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
        // Turned into JSON before the entry joins the buffer, and only then: one that cannot be sent as JSON
        // would fail every batch it was in, holding back every entry behind it for good. Every attempt sends
        // this text, so a retry sends the entry as it was written.
        const json = toJson(logEntry);
        if( json===undefined ) return createLoggingFailedResult(this.#writeFailure(NOT_JSON));

        // Registered and buffered in one turn, so whichever attempt sends the entry next answers this write too.
        const awaited: AwaitedDelivery = { ulid: logEntry.ulid };
        this.#awaitedDeliveries.add(awaited);
        try {
            this.#bufferStorage.add({ ulid: logEntry.ulid, json });
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
    #settle(batch: Buffered[], delivery: Delivery): void {
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


    /**
     * Send what the buffer holds, once every flush requested before this one has finished.
     *
     * A flush never starts in the turn that requested it. Writes made together are therefore all in the buffer
     * before the first batch is cut, so they share a batch rather than the first being sent alone.
     *
     * @returns Resolves when this flush has finished. Rejects only if it threw, and then only to this caller.
     */
    #flushBuffer(): Promise<void> {
        const flush = this.#flushing.then(() => this.#flush());
        // A flush that rejects must neither stop later flushes nor go unhandled here: its own caller hears it.
        this.#flushing = flush.catch(() => {});
        return flush;
    }

    /**
     * Send the buffer to the webhook in batches, stopping at the first batch that must wait for a retry.
     */
    async #flush(): Promise<void> {
        const backOffUntil = this.#bufferStorage.getBackOffUntil();
        if (Date.now() < backOffUntil.timestamp) {
            this.#requestFutureFlushBuffer();
            return;
        }

        let buffer = this.#bufferStorage.getBuffer();

        // Continue sending batches as long as there are items in the buffer
        while (buffer.length > 0) {
            const batch = buffer.slice(0, WebhookLogStorage.MAX_BATCH_SIZE);
            const delivery = await this.#send(batch);
            // Settled and removed from the buffer in one turn. A write of one of these entries arriving in
            // between would be skipped by the buffer (its ulid is still there), then removed unsent and
            // never answered.
            this.#settle(batch, delivery);

            if (delivery.kind === 'sent' || delivery.kind === 'refused') {
                // Sent, or discarded so a batch the webhook will never accept does not block the queue.
                this.#bufferStorage.markComplete(batch.map(x => x.ulid));
                buffer.splice(0, batch.length);
            } else {
                // Stop processing batches and wait for the backoff period.
                this.#handleFailure();
                break;
            }
        }
    }

    /**
     * POST one batch, giving up if the webhook has not answered within {@link WebhookLogStorage.TIMEOUT_MS}.
     *
     * @returns What became of the batch. Never rejects.
     */
    async #send(batch: Buffered[]): Promise<Delivery> {
        const controller = new AbortController();
        let timedOut = false;
        // Left holding the process, unlike the retry timer: it lives only while an attempt is in flight.
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, WebhookLogStorage.TIMEOUT_MS);
        try {
            // A PostBody, written out from each entry's JSON rather than stringified again: the same text
            // `JSON.stringify` gives `{ entries, instanceId }`.
            const postBody = `{"entries":[${batch.map(entry => entry.json).join(',')}],"instanceId":${JSON.stringify(this.instanceId)}}`;

            const response = await fetch(this.#postUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: postBody,
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
    #handleFailure(): void {
        const currentBackOff = this.#bufferStorage.getBackOffUntil();
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

        this.#bufferStorage.setBackOffUntil(newBackOff);
        this.#requestFutureFlushBuffer();
    }

    /**
     * Schedule a flush for just after the back-off ends, on a timer that never keeps the process running.
     */
    #requestFutureFlushBuffer(): void {
        const backOffUntil = this.#bufferStorage.getBackOffUntil();

        if (this.#callbackId) clearTimeout(this.#callbackId);

        const now = Date.now();
        if (backOffUntil.timestamp > now) {
            // Calculate remaining delay and set timeout
            const delay = backOffUntil.timestamp - now;
            // No call waits on this retry, so no result can carry its outcome and a failure is ignored; the next
            // write's result says how delivery is going.
            this.#callbackId = setTimeout(() => { this.#flushBuffer().catch(() => {}); }, delay + 1); // +1ms to ensure timestamp has passed
            letProcessExitBefore(this.#callbackId);
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
 * An entry waiting in the buffer: its ulid, and the JSON text every attempt sends for it.
 */
type Buffered = { readonly ulid: string, readonly json: string };

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

/**
 * Stop a timer from keeping a Node process running: the process may exit before it fires.
 *
 * A pending retry is the store's business, not the program's. A command-line tool that logs to a webhook that is
 * down must still exit once its own work is done, rather than wait on retries for ever.
 *
 * @param timer What `setTimeout` returned. In Node it is an object that can be unref'd; in a browser it is a
 * number, and a page's timers never keep anything open, so it is left as it is.
 */
function letProcessExitBefore(timer: unknown): void {
    if( typeof timer==='object' && timer!==null && 'unref' in timer && typeof timer.unref==='function' ) timer.unref();
}

/**
 * The entry as the JSON text a batch carries, or `undefined` if it cannot be turned into JSON.
 *
 * `JSON.stringify` throws on some values (a bigint, a circular reference) and gives `undefined`, not text, for
 * an entry whose own `toJSON` returns nothing. Both count as "not JSON".
 */
function toJson(entry: LogEntry): string | undefined {
    try {
        const json: unknown = JSON.stringify(entry);
        return typeof json==='string'? json : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The entries waiting to be posted, at most one per ulid, and the back-off.
 *
 * Every method is synchronous. The store relies on a write being registered and buffered in one turn, and on a
 * batch being settled and removed in one turn (see `#flush`), so nothing may happen in between.
 */
class BufferStorage {
    #buffer: Buffered[] = []

    /**
     * Track back offs
     */
    #backOffUntil: BackOffUntil = { timestamp: 0, attempt: 0 };

    /**
     * Buffer an entry, unless one with its ulid is already waiting: that copy is the one sent.
     */
    add(entry: Buffered): void {
        if( this.#buffer.some(buffered => buffered.ulid===entry.ulid) ) return;
        this.#buffer.push(entry);
    }

    getBuffer(): Buffered[] {
        return [...this.#buffer];
    }

    getBackOffUntil(): BackOffUntil {
        return structuredClone(this.#backOffUntil);
    }


    setBackOffUntil(backOff: BackOffUntil): void {
        this.#backOffUntil = structuredClone(backOff);
    }

    markComplete(entryUlids: string[]): void {

        const deleteIds = new Set(entryUlids);
        this.#buffer = this.#buffer.filter(x => !deleteIds.has(x.ulid));

        this.#backOffUntil = { timestamp: 0, attempt: 0 };
    }


}