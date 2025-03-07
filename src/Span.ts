
import { uuidV4 } from "@andyrmitchell/utils/uid";
import type { IRawLogger, LogEntry } from "./raw-storage/types.ts";
import type { ISpan, MinimumContext, SpanContext, TraceId } from "./types.ts";
import { WhereFilter, type WhereFilterDefinition } from "@andyrmitchell/objects";

/**
 * A span represents a unit of work or operation. Spans track specific operations that a request makes, painting a picture of what happened during the time in which that operation was executed.
 * 
 * It forms part of an overall trace, represented as a waterfall. 
 */
export class Span<T extends MinimumContext = MinimumContext> implements ISpan<T> {

    

    protected traceId: Readonly<TraceId>;
    protected storage:IRawLogger<SpanContext<T>>;

    constructor(storage:IRawLogger<any>, parent_id?: string) {
        this.storage = storage;

        this.traceId = {
            id: uuidV4(),
            parent_id
        }


        // Record the start time for accurate tracking
        this.storage.add({
            type: 'event',
            context: this.#expandContext(),
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
    #expandContext(context?:T): SpanContext<T> {
        return {
            external: context,
            trace: this.traceId
        }
    }
    
    async log(message: string, context?: T): Promise<void> {
        await this.storage.add({
            type: 'info',
            message,
            context: this.#expandContext(context)
        })
    }

    async warn(message: string, context?: T): Promise<void> {
        await this.storage.add({
            type: 'warn',
            message,
            context: this.#expandContext(context)
        })
    }

    async error(message: string, context?: T): Promise<void> {
        await this.storage.add({
            type: 'error',
            message,
            context: this.#expandContext(context)
        })
    }

    async getAll(): Promise<LogEntry<SpanContext<T>>[]> {
        return await this.storage.getAll();
    }

    async getAllFilter(filter:WhereFilterDefinition): Promise<any[]> {
        return (await this.getAll()).filter(x => WhereFilter.matchJavascriptObject(x, filter));
    }

    
    startSpan(name?: string): ISpan<T> {

        return new Span<T>(this.storage, this.traceId.id);
        
    }

    async end(): Promise<void> {

        await this.storage.add({
            type: 'event',
            context: this.#expandContext(),
            event: {
                name: 'span_end'
            }
        })
    }
}