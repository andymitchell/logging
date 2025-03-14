
import type { DeepSerializable } from "@andyrmitchell/utils/deep-clone-scalar-values";
import { type MinimumContext } from "../types.ts";
import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";




export type BaseLogEntry<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> = {
    timestamp: number,
    /**
     * Externally passed-in context (e.g. a parameter when the .log function is called)
     */
    context?: DeepSerializable<T>,

    /**
     * Internal data used by the logging system. Does not get security-reduced. Use for things like Span ID.
     */
    meta?: M,
    
    stack_trace?: string
}
type InfoLogEntry<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> = BaseLogEntry<T, M> & {
    type: 'info',
    message: string
};
type WarnLogEntry<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> = BaseLogEntry<T, M> & {
    type: 'warn',
    message: string
};
type ErrorLogEntry<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> = BaseLogEntry<T, M> & {
    type: 'error',
    message: string
};

type BaseEventDetail = {
    name: string
}
type StartEventDetail = BaseEventDetail & {
    name: 'span_start'
}
type EndEventDetail = BaseEventDetail & {
    name: 'span_end'
}
export type EventDetail = StartEventDetail | EndEventDetail;

type EventLogEntry<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> = BaseLogEntry<T, M> & {
    type: 'event',
    event: EventDetail
};

/**
 * Union of all possible entry types
 */
export type LogEntry<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> = 
    InfoLogEntry<T, M> | 
    WarnLogEntry<T, M> | 
    ErrorLogEntry<T, M> |
    EventLogEntry<T, M>

/**
 * Like LogEntry, but context can be anything (not yet serialised down)
 */
export type AcceptLogEntry<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> =
  | (Omit<InfoLogEntry<T, M>, 'context' | 'stack_trace' | 'timestamp'> & { context?: T })
  | (Omit<WarnLogEntry<T, M>, 'context' | 'stack_trace' | 'timestamp'> & { context?: T })
  | (Omit<ErrorLogEntry<T, M>, 'context' | 'stack_trace' | 'timestamp'> & { context?: T })
  | (Omit<EventLogEntry<T, M>, 'context' | 'stack_trace' | 'timestamp'> & { context?: T });




export type LogEntryType = LogEntry['type'];

export interface IRawLogger<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> {

    /**
     * Add an entry to the data store
     * @param entry 
     */
    add(entry:AcceptLogEntry<T, M>):Promise<void>;

    /**
     * Retrieve entries from the data store
     */
    get(filter?:WhereFilterDefinition<LogEntry<T, M>>): Promise<LogEntry<T, M>[]>;

}