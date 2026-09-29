import type { LoggingError, LoggingFailureListener } from "./types.ts";


/**
 * How many deliveries are running right now, across every store. Non-zero exactly while a listener runs.
 */
let deliveriesRunning = 0;


/**
 * Whether the caller is running inside a failure listener, i.e. was called by one.
 *
 * A logging call started from inside a listener still returns its result, but must not deliver its own
 * failure: a listener that logs into the failing store would otherwise hear its own failure, log again, and
 * never stop (dec-listener-writes-never-deliver). Take the answer when the call starts, because by the time an
 * asynchronous failure arrives the listener has returned.
 */
export function isInsideFailureListener(): boolean {
    return deliveriesRunning > 0;
}


/**
 * The listeners a store tells when one of its calls fails.
 *
 * Listeners are consumer code, so each one is contained: a listener that throws or rejects is skipped,
 * the rest still run, and delivery itself never throws.
 */
export class FailureListeners {
    #listeners = new Set<LoggingFailureListener>();

    /**
     * Add a listener. Adding the same function again has no effect.
     *
     * @param listener - Told the error of every failed call from now on.
     * @returns A function that removes the listener.
     */
    subscribe(listener: LoggingFailureListener): () => void {
        this.#listeners.add(listener);
        return () => { this.#listeners.delete(listener); };
    }

    /**
     * Tell every current listener about `error`, in the order they subscribed.
     *
     * A listener subscribed while this runs does not hear this error.
     *
     * @param error - The error the failed call is returning, passed as the same object.
     */
    deliver(error: LoggingError): void {
        deliveriesRunning++;
        try {
            for (const listener of [...this.#listeners]) {
                try {
                    ignoreRejection(listener(error));
                } catch {
                    // A throwing listener is skipped. Reporting it would be a second failure of the same system.
                }
            }
        } finally {
            deliveriesRunning--;
        }
    }
}


/**
 * Attach a no-op rejection handler to `value` if it is a promise (or any thenable), so a rejecting listener
 * or hook never becomes an unhandled rejection. Anything else is left alone. Never throws, even for a
 * thenable whose `then` throws.
 */
export function ignoreRejection(value: unknown): void {
    try {
        if ((typeof value === 'object' || typeof value === 'function') && value !== null && 'then' in value && typeof value.then === 'function') {
            value.then(undefined, () => undefined);
        }
    } catch {
        // A thenable whose `then` throws cannot reject later, so there is nothing left to handle.
    }
}
