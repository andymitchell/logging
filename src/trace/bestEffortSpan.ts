/**
 * Span-aware best-effort logging - log without letting the logging hold up or break the code around it.
 *
 * `bestEffortSpanLog` caps how long a span call may take and no-ops when no span is supplied, so a call-site
 * needs no `if (span)` guard. `tryStartSpan` covers the one span call that is synchronous — `startSpan` — which
 * a time cap cannot wrap.
 */

import { bestEffort } from "@andymitchell/utils";
import type { ISpan } from "./types.ts";

/** How long {@link bestEffortSpanLog} waits on a logging call before moving on, in milliseconds. */
export const DEFAULT_LOG_TIMEOUT_MS = 1000;

/**
 * Runs a span logging call, waiting at most a set time for it and never letting it throw or reject.
 *
 * Use this around `log`, `error` or `end` calls made as side notes to other work, where the work must not wait
 * long on logging. A write can be slow: a Webhook write waits on the network, an IndexedDB write on the
 * transaction. If no span is supplied it resolves immediately, so a call-site can make logging optional
 * without its own guard.
 *
 * @param span - The span to log to, or `undefined` when logging is off for this call.
 * @param op - The logging call to run with `span`.
 * @param opts - Optional: `timeoutMs`, how long to wait for `op` (default {@link DEFAULT_LOG_TIMEOUT_MS}).
 * @returns A promise that resolves once `op` settles or the time runs out, whichever is first. It never
 * rejects, and it does not pass back `op`'s result.
 *
 * @example
 * await bestEffortSpanLog(span, (s) => s.log("response", context));
 *
 * @remarks
 * A failed write is not reported again here. A write through a built-in span already answers with the failure
 * and delivers it to the store's `onFailure` listeners, and writing "logging failed" to the same span would
 * most likely fail the same way. Call the span directly when the write's result is needed.
 *
 * A span from another `ISpan` implementation might throw or reject instead; that is swallowed.
 *
 * If the time runs out, `op` keeps running in the background and may still finish; a built-in store still
 * delivers its failure to `onFailure` if it fails later.
 */
export function bestEffortSpanLog(
  span: ISpan | undefined,
  op: (s: ISpan) => Promise<unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<void> {
  if (!span) return Promise.resolve();
  return bestEffort(() => op(span), {
    timeoutMs: opts.timeoutMs ?? DEFAULT_LOG_TIMEOUT_MS,
  });
}

/**
 * Starts a child span, answering `undefined` instead of throwing if the span's implementation throws.
 *
 * Built-in spans never throw from `startSpan`: a store that fails to record the child's `span_start` entry
 * delivers the failure to its `onFailure` listeners instead. This guards spans from other `ISpan`
 * implementations, which might throw, so that a failed start turns logging off for that call rather than
 * breaking the work being logged.
 *
 * @param parent - The span to start the child under.
 * @param name - The child span's name.
 * @param context - The context recorded with the child's `span_start` entry.
 * @returns The child span, or `undefined` if `startSpan` threw.
 *
 * @example
 * const span = tryStartSpan(logSpan, "write", { request: { actions }, write_id });
 * await bestEffortSpanLog(span, (s) => s.log("written"));
 *
 * @remarks
 * `startSpan` is synchronous, so {@link bestEffortSpanLog}'s time cap cannot wrap it; this is the synchronous
 * counterpart.
 */
export function tryStartSpan(
  parent: ISpan,
  name: string,
  context: unknown,
): ISpan | undefined {
  try {
    return parent.startSpan(name, context);
  } catch {
    return undefined;
  }
}
