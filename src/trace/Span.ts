
import { uuidV4 } from "@andymitchell/utils/uid";
import { deepFreeze } from "@andymitchell/utils/deep-freeze";
import { cloneToJsonSafe } from "@andymitchell/clone-to-json-safe";
import type { AcceptLogEntry, ILogStorage, LogCallMaskingOptions, LogEntry, LogEntryType } from "../log-storage/types.ts";

import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { ISpan, SpanMeta,  SpanId } from "./types.ts";
import type { InferContextTypeFromLogArgsWithoutMessage, MinimumContext } from "../types.ts";
import type { LogReadResult, LogWriteResult } from "../failures/types.ts";
import { normalizeArgs } from "../utils/normalizeArgs.ts";
import { guardedRead, guardedWrite } from "../failures/guardedCalls.ts";
import { assertLogStorage } from "../log-storage/assertLogStorage.ts";



/**
 * Supplies span operations for a trace relationship that is already known.
 *
 * A span relationship contains the current span ID, the top-level trace ID, and optionally the parent span
 * ID. A `SpanHandle` binds that relationship to local log storage so logs, child spans, and end events carry
 * consistent ancestry. {@link Span} extends this shared behavior by generating a new relationship and
 * recording its start; trace continuation uses a handle for an existing relationship without fabricating a
 * second start event.
 *
 * @remarks
 * Constructing this handle clones the relationship into a JSON-safe value and deeply freezes that owned copy.
 * It does not validate IDs or emit a `span_start` event. Code that attaches external relationships must
 * validate them before construction. The handle is internal so callers use {@link Span} for locally owned
 * work or `continueTrace` for serialized ancestry.
 */
class SpanHandle implements ISpan {

    protected spanId: Readonly<SpanId>;
    protected storage:ILogStorage;

    constructor(storage: ILogStorage, spanId: Readonly<SpanId>) {
        assertLogStorage(storage, 'Span');
        this.storage = storage;
        this.spanId = deepFreeze(cloneToJsonSafe(spanId));
    }

    protected recordStart(name?: string, context?: any, options?: LogCallMaskingOptions): void {
        // `options` (if any) scopes ONLY to this span_start entry's own context — it is deliberately NOT
        // retained for logs emitted later within the span. Nobody awaits this write: a failure reaches the
        // store's failure listeners, and the write never rejects.
        void this.#write(() => ({
            type: 'event',

            meta: {
                ...this.#getMeta()
            },
            message: name,
            context,
            event: {
                name: 'span_start'
            }
        }), options);
    }

    /**
     * Convert the externally provided context into our SpanMeta
     * @param context 
     * @returns 
     */
    #getMeta(): SpanMeta {
        return {
            type: 'span',
            span: this.spanId
        }
    }

    /**
     * Write through the safety net: resolves a result whatever the store does, and never rejects. The store
     * is called synchronously, so the span's start is recorded before its constructor returns.
     */
    #write<C extends MinimumContext = MinimumContext>(buildEntry: () => AcceptLogEntry, options?: LogCallMaskingOptions<C>):Promise<LogWriteResult<any, SpanMeta>> {
        // `add` is non-generic at the storage boundary (dec-add-boundary-non-generic); widening a `C`-narrowed
        // directive to string paths is sound but unprovable for an abstract `C`, so it is asserted at this hand-off.
        return guardedWrite<SpanMeta>(this.storage, 'Span', buildEntry, options as LogCallMaskingOptions | undefined);
    }

    #writeMessage<C extends MinimumContext = MinimumContext>(type: Exclude<LogEntryType, 'event'>, args: unknown[], options?: LogCallMaskingOptions<C>):Promise<LogWriteResult<any, SpanMeta>> {
        return this.#write(() => ({
            type,
            ...normalizeArgs(args), // message + context
            meta: this.#getMeta()
        }), options);
    }


    async debug<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>, SpanMeta>> {
        return this.#writeMessage('debug', [message, ...context]);
    }

    async log<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>, SpanMeta>> {
        return this.#writeMessage('info', [message, ...context]);
    }

    async warn<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>, SpanMeta>> {
        return this.#writeMessage('warn', [message, ...context]);
    }

    async error<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>, SpanMeta>> {
        return this.#writeMessage('error', [message, ...context]);
    }

    async critical<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>, SpanMeta>> {
        return this.#writeMessage('critical', [message, ...context]);
    }


    async debugWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C, SpanMeta>> {
        return this.#writeMessage('debug', [message, context], options); // single context, masked per `options`
    }

    async logWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C, SpanMeta>> {
        return this.#writeMessage('info', [message, context], options);
    }

    async warnWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C, SpanMeta>> {
        return this.#writeMessage('warn', [message, context], options);
    }

    async errorWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C, SpanMeta>> {
        return this.#writeMessage('error', [message, context], options);
    }

    async criticalWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C, SpanMeta>> {
        return this.#writeMessage('critical', [message, context], options);
    }

    async get(filter?:WhereFilterDefinition<LogEntry<any, SpanMeta>>): Promise<LogReadResult<LogEntry<any, SpanMeta>>> {
        return guardedRead(this.storage, 'Span', () => this.storage.get(filter));
    }

    
    startSpan(name?: string, context?: any): ISpan {

        return new Span(
            this.storage,
            {
                parent_id: this.spanId.id,
                top_id: this.spanId.top_id ?? this.spanId.id
            },
            name,
            context
        );

    }

    startSpanWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, name?: string, context?: C): ISpan {

        return new Span(
            this.storage,
            {
                parent_id: this.spanId.id,
                top_id: this.spanId.top_id ?? this.spanId.id
            },
            name,
            context,
            // Widen the C-narrowed directive to the Span ctor's non-generic carrier (sound; see #addToStorage).
            options as LogCallMaskingOptions
        );

    }

    async end(): Promise<LogWriteResult<undefined, SpanMeta>> {
        return this.#write(() => ({
            type: 'event',
            meta: this.#getMeta(),
            event: {
                name: 'span_end'
            }
        }));
    }

    getId() {
        return this.spanId.id;
    }

    getFullId(): SpanId {
        return structuredClone(this.spanId);
    }

}

/**
 * Creates and represents a locally owned unit of work within a trace.
 *
 * A trace is a connected history of work, and each span describes one operation within that history. Every
 * `Span` receives a fresh ID, records a `span_start` event, and either begins a new trace or links to the
 * supplied previous relationship. Logs and child spans reuse that ancestry so a trace viewer can reconstruct
 * the operation waterfall. The common logging behavior comes from {@link SpanHandle}; this class adds the
 * identity and lifecycle start for work created in the current process.
 *
 * @example
 * const requestSpan = new Span(logStorage, undefined, 'Process request', { requestId });
 * try {
 *     await requestSpan.log('Request accepted');
 * } finally {
 *     await requestSpan.end();
 * }
 *
 * @remarks
 * A `Span` owns the relationship it creates, so its owner should call {@link ISpan.end} when the represented
 * work settles. To attach a serialized relationship without claiming ownership of the remote span, use
 * `continueTrace` and create a locally owned child from the returned handle.
 */
export class Span extends SpanHandle implements ISpan {

    /**
     * Creates a span and records its start in the supplied storage.
     *
     * @param storage The storage that receives this span's events and logs.
     * @param parent The previous relationship to descend from. `parent_id` identifies the immediate parent;
     * `top_id` keeps the new span in the existing trace. Omit it to begin a top-level span.
     * @param name An optional operation name written on the `span_start` event.
     * @param context Optional structured context written on the `span_start` event.
     * @param options Optional masking directives that apply only to the start event's context.
     * @throws TypeError if `storage` lacks `onFailure` or `reportInternalFailure` (a store that does not
     * implement {@link ILogStorage}). A store that fails to record the start does not make this throw: the
     * failure is told to the store's failure listeners.
     */
    constructor(storage:ILogStorage, parent?: {parent_id?: string, top_id?: string}, name?: string, context?: any, options?: LogCallMaskingOptions) {
        const id = uuidV4();
        super(storage, {
            id,
            parent_id: parent?.parent_id,
            top_id: parent?.top_id ?? id
        });

        this.recordStart(name, context, options);
    }

}

/** @internal */
export function createSpanHandle(storage: ILogStorage, spanId: Readonly<SpanId>): ISpan {
    return new SpanHandle(storage, spanId);
}
