import {
  isEventLogEntry,
  type EventLogEntry,
  type LogCallMaskingOptions,
  type LogEntry,
  type StartEventDetail,
} from "../log-storage/types.ts";
import type { ILogger, MinimumContext } from "../types.ts";
import type { LogWriteResult } from "../failures/types.ts";

export interface ISpan extends ILogger {
  /**
   * Starts a child span whose entries link back to this span as their parent.
   *
   * The child records its `span_start` entry straight away, in the same store as this span.
   *
   * @param name - The child span's name, recorded on its `span_start` entry.
   * @param context - Context recorded on the child's `span_start` entry.
   * @returns The child span.
   *
   * @remarks
   * Implementations must not throw. Built-in spans never do: a store that fails to record the `span_start`
   * entry delivers the failure to its `onFailure` listeners instead. `tryStartSpan` guards a call to a span
   * from an implementation that might throw.
   */
  startSpan(name?: string, context?: any): ISpan;

  /**
   * Like {@link ISpan.startSpan}, but `options` may keep specific values in the NEW span's OWN context (the
   * span_start entry) UNMASKED — gated by path AND value-shape, honored only by a storage with
   * `allow_per_call_unmasking`. Scope is the span's own context only; logs emitted later within the span are
   * NOT affected. @see LogCallMaskingOptions
   */
  startSpanWithOptions<C extends MinimumContext>(
    options: LogCallMaskingOptions<C>,
    name?: string,
    context?: C,
  ): ISpan;

  /**
   * Adds a final timestamp for duration logging.
   *
   * Optional.
   *
   * @returns The `span_end` write's result, like any other write. Never rejects.
   */
  end(): Promise<LogWriteResult<undefined, SpanMeta>>;

  /**
   * The the ID of this instance (`SpanId.id`)
   *
   *
   * @remarks
   * Implement as a simple data accessor and do not throw an error
   */
  getId(): string;

  /**
   * Get the `SpanId` for this (the id, the parent and the original top/start)
   *
   * @remarks
   * Implement as a simple data accessor and do not throw an error (or if you're using it just to start a new span, consider the safer `tryStartSpan` to suppress errors)
   */
  getFullId(): SpanId;
}

export type SpanId = {
  id: string;
  top_id: string;
  parent_id?: string;
};

export type SpanMeta = {
  type: "span";
  span: SpanId;
};

export type TraceEntry<C extends MinimumContext = any> = LogEntry<C, SpanMeta>;

/**
 * Test if the variable is the event entry that marks the start of a span.
 *
 * Every span writes one `span_start` event when it begins. Its `meta.span` holds the span's own id and its
 * `parent_id`, which is what lets a viewer rebuild the span tree from a flat list of entries.
 *
 * @param x Any value, typically an entry from a trace.
 * @returns `true` if `x` is an event entry whose `event.name` is `'span_start'`.
 *
 * @example
 * const spanStarts = trace.logs.filter(isEventLogEntrySpanStart);
 * const rootSpan = spanStarts.find(e => !e.meta.span.parent_id);
 *
 * @remarks
 * Only the discriminators are checked. `meta` is typed as {@link SpanMeta} on the assumption the entry came from a trace.
 */
export function isEventLogEntrySpanStart(
  x: unknown,
): x is EventLogEntry<any, SpanMeta, StartEventDetail> {
  return isEventLogEntry(x) && x.event.name === "span_start";
}
