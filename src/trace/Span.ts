
import { uuidV4 } from "@andyrmitchell/utils/uid";
import type { IRawLogger, LogEntry } from "../raw-storage/types.ts";

import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { MinimumContext } from "../types.ts";
import type { ISpan, SpanContext, TraceId } from "./types.ts";

/**
 * A span represents a unit of work or operation. Spans track specific operations that a request makes, painting a picture of what happened during the time in which that operation was executed.
 * 
 * It forms part of an overall trace, represented as a waterfall. 
 */
export class Span<T extends MinimumContext = MinimumContext> implements ISpan<T> {

    

    protected traceId: Readonly<TraceId>;
    protected storage:IRawLogger<T, SpanContext>;

    constructor(storage:IRawLogger<any, any>, parent?: {parent_id?: string, top_id?: string}, name?: string, context?: T) {
        this.storage = storage;

        const id = uuidV4();
        this.traceId = {
            id,
            parent_id: parent?.parent_id,
            top_id: parent?.top_id ?? id
        }


        // Record the start time for accurate tracking
        this.storage.add({
            type: 'event',
            meta: {
                ...this.#getMeta(),
                name
            },
            context,
            event: {
                name: 'span_start'
            }
        })
        
    }

    /**
     * Convert the externally provided context into our SpanContext
     * @param context 
     * @returns 
     */
    #getMeta(): SpanContext {
        return {
            trace: this.traceId
        }
    }
    
    async log(message: string, context?: T): Promise<void> {
        await this.storage.add({
            type: 'info',
            message,
            context, 
            meta: this.#getMeta()
        })
    }

    async warn(message: string, context?: T): Promise<void> {
        await this.storage.add({
            type: 'warn',
            message,
            context, 
            meta: this.#getMeta()
        })
    }

    async error(message: string, context?: T): Promise<void> {
        await this.storage.add({
            type: 'error',
            message,
            context, 
            meta: this.#getMeta()
        })
    }

    async get(filter?:WhereFilterDefinition<LogEntry<T, SpanContext>>): Promise<LogEntry<T, SpanContext>[]> {
        return await this.storage.get(filter);
    }

    
    startSpan<CT extends MinimumContext = T>(name?: string, context?: CT): ISpan<CT> {

        return new Span<CT>(
            this.storage, 
            {
                parent_id: this.traceId.id, 
                top_id: this.traceId.top_id ?? this.traceId.id
            }, 
            name, 
            context
        );
        
    }

    async end(): Promise<void> {

        await this.storage.add({
            type: 'event',
            meta: this.#getMeta(),
            event: {
                name: 'span_end'
            }
        })
    }

    getId() {
        return this.traceId.id;
    }
}