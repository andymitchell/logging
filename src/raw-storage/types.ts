
import type { DeepSerializable } from "@andyrmitchell/utils/deep-clone-scalar-values";
import { type MinimumContext } from "../types.ts";



export type BaseLogEntry<T extends MinimumContext = MinimumContext> = {
    timestamp: number,
    /**
     * Externally passed-in context (e.g. a parameter when the .log function is called)
     */
    context?: DeepSerializable<T>,
    
    stack_trace?: string
}
type InfoLogEntry<T extends MinimumContext = MinimumContext> = BaseLogEntry<T> & {
    type: 'info',
    message: string
};
type WarnLogEntry<T extends MinimumContext = MinimumContext> = BaseLogEntry<T> & {
    type: 'warn',
    message: string
};
type ErrorLogEntry<T extends MinimumContext = MinimumContext> = BaseLogEntry<T> & {
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

type EventLogEntry<T extends MinimumContext = MinimumContext> = BaseLogEntry<T> & {
    type: 'event',
    event: EventDetail
};

/**
 * Union of all possible entry types
 */
export type LogEntry<T extends MinimumContext = MinimumContext> = 
    InfoLogEntry<T> | 
    WarnLogEntry<T> | 
    ErrorLogEntry<T> |
    EventLogEntry<T>

/**
 * Like LogEntry, but context can be anything (not yet serialised down)
 */
export type AcceptLogEntry<T extends MinimumContext = MinimumContext> =
  | (Omit<InfoLogEntry<T>, 'context' | 'stack_trace' | 'timestamp'> & { context?: T })
  | (Omit<WarnLogEntry<T>, 'context' | 'stack_trace' | 'timestamp'> & { context?: T })
  | (Omit<ErrorLogEntry<T>, 'context' | 'stack_trace' | 'timestamp'> & { context?: T })
  | (Omit<EventLogEntry<T>, 'context' | 'stack_trace' | 'timestamp'> & { context?: T });




export type LogEntryType = LogEntry['type'];

export interface IRawLogger<T extends MinimumContext = MinimumContext> {

    /**
     * Add an entry to the data store
     * @param entry 
     */
    add(entry:AcceptLogEntry<T>):Promise<void>;

    /**
     * Retrieve all entries from the data store
     */
    getAll(): Promise<LogEntry<T>[]>;

}