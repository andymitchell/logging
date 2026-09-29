import type { ILogStorage } from "./types.ts";


/**
 * Throw if `storage` cannot be told about failures, i.e. lacks `onFailure` or `reportInternalFailure`.
 *
 * Loggers and spans hand the failures they catch to their store, so a store without these methods (one
 * written for an older version of this library, or a hand-written fake) would silently lose them. Checking
 * when the logger or span is built turns that into an immediate, deterministic error at wiring time, rather
 * than a missing report later.
 *
 * @param storage The store a `Logger` or span is being built with.
 * @param owner What is being built, named in the error: `'Logger'` or `'Span'`.
 * @throws TypeError naming the missing methods.
 */
export function assertLogStorage(storage: ILogStorage, owner: 'Logger' | 'Span'): void {
    if (typeof storage !== 'object' || storage === null) {
        throw new TypeError(`${owner} needs a log storage, but was given ${storage === null ? 'null' : typeof storage}.`);
    }
    const missing = [
        typeof storage.onFailure === 'function' ? undefined : 'onFailure',
        typeof storage.reportInternalFailure === 'function' ? undefined : 'reportInternalFailure',
    ].filter(name => name !== undefined);
    if (missing.length > 0) {
        throw new TypeError(`${owner} needs a log storage that implements onFailure and reportInternalFailure, but this one is missing ${missing.join(' and ')}. Extend BaseLogStorage, or add both methods to the storage.`);
    }
}
