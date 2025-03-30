
import { uuidV4 } from "@andyrmitchell/utils/uid";
import type { AcceptLogEntry, IRawLogger, LogEntry } from "../raw-storage/types.ts";

import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { MinimumContext } from "../types.ts";
import type { ISpan, SpanMeta,  SpanId } from "./types.ts";



/**
 * A span represents a unit of work or operation. Spans track specific operations that a request makes, painting a picture of what happened during the time in which that operation was executed.
 * 
 * It forms part of an overall trace, represented as a waterfall. 
 */
export class Span<T extends MinimumContext = MinimumContext> implements ISpan<T> {

    

    protected spanId: Readonly<SpanId>;
    protected storage:IRawLogger<T, SpanMeta>;

    constructor(storage:IRawLogger<any, any>, parent?: {parent_id?: string, top_id?: string}, name?: string, context?: T) {
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

    async #addToStorage(entry: AcceptLogEntry<T, SpanMeta>):Promise<void> {
        return await this.storage.add(entry);
    }
    
    async log(message: string, context?: T): Promise<void> {
        await this.#addToStorage({
            type: 'info',
            message,
            context, 
            meta: this.#getMeta()
        })
    }

    async warn(message: string, context?: T): Promise<void> {
        await this.#addToStorage({
            type: 'warn',
            message,
            context, 
            meta: this.#getMeta()
        })
    }

    async error(message: string, context?: T): Promise<void> {
        await this.#addToStorage({
            type: 'error',
            message,
            context, 
            meta: this.#getMeta()
        })
    }

    async get(filter?:WhereFilterDefinition<LogEntry<T, SpanMeta>>): Promise<LogEntry<T, SpanMeta>[]> {
        return await this.storage.get(filter);
    }

    
    startSpan<CT extends MinimumContext = T>(name?: string, context?: CT): ISpan<CT> {

        return new Span<CT>(
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