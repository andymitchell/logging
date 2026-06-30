
import { uuidV4 } from "@andyrmitchell/utils/uid";
import type { AcceptLogEntry, ILogStorage, LogCallMaskingOptions, LogEntry } from "../log-storage/types.ts";

import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { ISpan, SpanMeta,  SpanId } from "./types.ts";
import type { InferContextTypeFromLogArgsWithoutMessage, MinimumContext } from "../types.ts";
import { normalizeArgs } from "../utils/normalizeArgs.ts";



/**
 * A span represents a unit of work or operation. Spans track specific operations that a request makes, painting a picture of what happened during the time in which that operation was executed.
 * 
 * It forms part of an overall trace, represented as a waterfall. 
 */
export class Span implements ISpan {

    

    protected spanId: Readonly<SpanId>;
    protected storage:ILogStorage;

    constructor(storage:ILogStorage, parent?: {parent_id?: string, top_id?: string}, name?: string, context?: any, options?: LogCallMaskingOptions) {
        this.storage = storage;

        const id = uuidV4();
        this.spanId = {
            id,
            parent_id: parent?.parent_id,
            top_id: parent?.top_id ?? id
        }


        // Record the start time for accurate tracking. `options` (if any) scopes ONLY to this span_start
        // entry's own context — it is deliberately NOT retained for logs emitted later within the span.
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
        }, options)

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