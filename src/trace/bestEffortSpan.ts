/**
 * Span-aware best-effort logging - safely log without worrying if it succeeds.
 *
 * `bestEffortSpanLog` wraps a span call in {@link bestEffort} and hides its `onError` hook behind a `caller`
 * label, so a fault is self-reported once (via `span.error`) without polluting call-sites; it also no-ops when
 * no span is supplied, so a call-site needs no `if (span)` guard. `tryStartSpan` brackets the one logging call
 * that is synchronous — `startSpan` — which a time-cap cannot wrap, so it is suppress-only.
 */

import { bestEffort } from "@andymitchell/utils";
import type { ISpan } from "./types.ts";

/** Wall-clock budget an ICollection operation waits on any one logging call before proceeding. */
export const DEFAULT_LOG_TIMEOUT_MS = 1000;

/**
 * Runs a span logging operation without letting logging failure affect the caller.
 *
 * Use this around `log`, `error`, or `end` calls made as observational side effects. If no span is supplied it
 * resolves immediately, so call sites can express optional logging without their own guard.
 *
 * @param span - The span to operate on, or `undefined` when logging is disabled for this call.
 * @param op - The asynchronous logging operation to run with `span`.
 * @param opts - The caller label used for self-reporting, plus an optional timeout override.
 * @returns A promise that resolves when `op` settles or the timeout elapses; it never rejects.
 *
 * @example
 * await bestEffortSpanLog(span, (s) => s.log("response", context), {
 *   caller: "MemoryCollection.write",
 * });
 *
 * @remarks
 * If `op` throws or rejects, the failure is reported once through `span.error` using `opts.caller`, and that
 * report is also suppressed if it fails. If the timeout wins, `op` is left running detached and may still
 * complete later.
 */
export function bestEffortSpanLog(
  span: ISpan | undefined,
  op: (s: ISpan) => Promise<unknown>,
  opts: { caller: string; timeoutMs?: number },
): Promise<void> {
  if (!span) return Promise.resolve();
  return bestEffort(() => op(span), {
    timeoutMs: opts.timeoutMs ?? DEFAULT_LOG_TIMEOUT_MS,
    // One-shot self-report via the same span; `.catch` swallows a rejecting report, `bestEffort`'s try/catch a
    // synchronous one — so reporting a dead sink cannot itself surface. Stringify the error: it crosses into a
    // log context the layer redacts, and a raw Error/object adds nothing a string locator does not.
    onError: (error) => {
      void span
        .error(`${opts.caller}: logging failed`, { error: String(error) })
        .catch(() => undefined);
    },
  });
}

/**
 * Starts a child span while suppressing synchronous failures from the logging implementation.
 *
 * Use this for `startSpan`, which is synchronous and therefore cannot be wrapped by the timeout-based
 * {@link bestEffortSpanLog}. A failed span start disables logging for that call instead of changing the
 * operation being logged.
 *
 * @param parent - The parent span used to open the child span.
 * @param name - The child span name.
 * @param context - The context object recorded when the child span starts.
 * @returns The child span, or `undefined` when `startSpan` throws.
 *
 * @example
 * const span = tryStartSpan(logSpan, "write", { request: { actions }, write_id });
 * if (!span) return undefined;
 *
 * @remarks
 * Only synchronous exceptions from `startSpan` are handled here. Async span operations should be wrapped with
 * {@link bestEffortSpanLog}.
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
