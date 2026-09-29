import type { LoggingFailed, LoggingFailure } from "./types.ts";


/**
 * Build the failed result of a logging call from the failures behind it.
 *
 * The failures are listed in the order given, as the same objects: a failure is described once, where it
 * happened, and never re-described on the way up. The error's `message` is a one-line summary of them.
 *
 * @param failures - Every failure behind the call; at least one.
 * @returns `{ ok: false, error: { message, failures } }`. Add `entry`, `entries` or `traces` to make it the
 * result of a write, read or trace search.
 *
 * @example
 * failed({ source: 'IDBLogStorage:my-app', operation: 'write', message: 'Could not record the entry in IndexedDB.' });
 * // { ok: false, error: { message: '[IDBLogStorage:my-app] Could not record the entry in IndexedDB.', failures: [ … ] } }
 *
 * @example
 * return { ...failed(...childFailures), entries }; // a partial read
 */
export function failed(...failures: [LoggingFailure, ...LoggingFailure[]]): LoggingFailed {
    return {
        ok: false,
        error: {
            message: summarise(failures),
            failures: [...failures],
        },
    };
}


function summarise(failures: [LoggingFailure, ...LoggingFailure[]]): string {
    const described = failures.map(failure => `[${failure.source}] ${failure.message}`).join('; ');
    return failures.length === 1 ? described : `${failures.length} logging failures: ${described}`;
}
