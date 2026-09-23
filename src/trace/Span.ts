
import { uuidV4 } from "@andymitchell/utils/uid";
import { deepFreeze } from "@andymitchell/utils/deep-freeze";
import { cloneToJsonSafe } from "@andymitchell/clone-to-json-safe";
import type { AcceptLogEntry, ILogStorage, LogCallMaskingOptions, LogEntry } from "../log-storage/types.ts";

import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { ISpan, SpanMeta,  SpanId } from "./types.ts";
import type { InferContextTypeFromLogArgsWithoutMessage, MinimumContext } from "../types.ts";
import { normalizeArgs } from "../utils/normalizeArgs.ts";



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
        this.storage = storage;
        this.spanId = deepFreeze(cloneToJsonSafe(spanId));
    }

    protected recordStart(name?: string, context?: any, options?: LogCallMaskingOptions): void {
        // `options` (if any) scopes ONLY to this span_start entry's own context — it is deliberately NOT
        // retained for logs emitted later within the span.
        this.storage.add({
            type: 'event',

            meta: {
                ...this.#getMeta()
            },
            message: name,
            context,
            event: {
                name: 'span_start'
            }
        }, options);
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

    async #addToStorage<C extends MinimumContext = MinimumContext>(entry: AcceptLogEntry, options?: LogCallMaskingOptions<C>):Promise<LogEntry<any, SpanMeta>> {
        // `add` is non-generic at the storage boundary (dec-add-boundary-non-generic); widening a `C`-narrowed
        // directive to string paths is sound but unprovable for an abstract `C`, so it is asserted at this hand-off.
        const logEntry = await this.storage.add(entry, options as LogCallMaskingOptions | undefined) as LogEntry<any, SpanMeta>;
        return logEntry;
    }
    
    
    async debug<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>, SpanMeta>> {
        
        return await this.#addToStorage({
            type: 'debug',
            ...normalizeArgs([message, ...context]), // message + context
            meta: this.#getMeta()
        })
    }

    async log<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>, SpanMeta>> {
        
        return await this.#addToStorage({
            type: 'info',
            ...normalizeArgs([message, ...context]), // message + context
            meta: this.#getMeta()
        })
    }

    async warn<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>, SpanMeta>> {
        
        return await this.#addToStorage({
            type: 'warn',
            ...normalizeArgs([message, ...context]), // message + context
            meta: this.#getMeta()
        })
    }

    async error<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>, SpanMeta>> {
        
        return await this.#addToStorage({
            type: 'error',
            ...normalizeArgs([message, ...context]), // message + context
            meta: this.#getMeta()
        })
    }

    async critical<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>, SpanMeta>> {

        return await this.#addToStorage({
            type: 'critical',
            ...normalizeArgs([message, ...context]), // message + context
            meta: this.#getMeta()
        })
    }


    async debugWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C, SpanMeta>> {
        return await this.#addToStorage({
            type: 'debug',
            ...normalizeArgs([message, context]), // single context, masked per `options`
            meta: this.#getMeta()
        }, options)
    }

    async logWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C, SpanMeta>> {
        return await this.#addToStorage({
            type: 'info',
            ...normalizeArgs([message, context]),
            meta: this.#getMeta()
        }, options)
    }

    async warnWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C, SpanMeta>> {
        return await this.#addToStorage({
            type: 'warn',
            ...normalizeArgs([message, context]),
            meta: this.#getMeta()
        }, options)
    }

    async errorWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C, SpanMeta>> {
        return await this.#addToStorage({
            type: 'error',
            ...normalizeArgs([message, context]),
            meta: this.#getMeta()
        }, options)
    }

    async criticalWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C, SpanMeta>> {
        return await this.#addToStorage({
            type: 'critical',
            ...normalizeArgs([message, context]),
            meta: this.#getMeta()
        }, options)
    }

    async get(filter?:WhereFilterDefinition<LogEntry<any, SpanMeta>>): Promise<LogEntry<any, SpanMeta>[]> {
        return await this.storage.get(filter);
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

    async end(): Promise<void> {

        await this.#addToStorage({
            type: 'event',
            meta: this.#getMeta(),
            event: {
                name: 'span_end'
            }
        })
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
