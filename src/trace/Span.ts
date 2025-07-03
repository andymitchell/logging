
import { uuidV4 } from "@andyrmitchell/utils/uid";
import type { AcceptLogEntry, ILogStorage, LogEntry } from "../log-storage/types.ts";

import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { ISpan, SpanMeta,  SpanId } from "./types.ts";
import type { InferContextTypeFromLogArgsWithoutMessage } from "../types.ts";
import { normalizeArgs } from "../utils/normalizeArgs.ts";



/**
 * A span represents a unit of work or operation. Spans track specific operations that a request makes, painting a picture of what happened during the time in which that operation was executed.
 * 
 * It forms part of an overall trace, represented as a waterfall. 
 */
export class Span implements ISpan {

    

    protected spanId: Readonly<SpanId>;
    protected storage:ILogStorage;

    constructor(storage:ILogStorage, parent?: {parent_id?: string, top_id?: string}, name?: string, context?: any) {
        this.storage = storage;

        const id = uuidV4();
        this.spanId = {
            id,
            parent_id: parent?.parent_id,
            top_id: parent?.top_id ?? id
        }


        // Record the start time for accurate tracking
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
        })
        
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

    async #addToStorage(entry: AcceptLogEntry):Promise<LogEntry<any, SpanMeta>> {
        const logEntry = await this.storage.add(entry) as LogEntry<any, SpanMeta>;
        return logEntry;
    }
    
    
    async debug<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>, SpanMeta>> {
        
        return await this.#addToStorage({
            type: 'info', // TODO
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