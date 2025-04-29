
import type { DeepSerializable } from "@andyrmitchell/utils/deep-clone-scalar-values";
import { type MinimumContext } from "../types.ts";
import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { IBreakpoints } from "../breakpoints/types.ts";


/**
 * Test if the variable is a LogEntry. 
 * 
 * It's not an exhaustive zod-schema driven test, because trying to avoid requiring zod for this. 
 * @param x 
 */
export function isLogEntrySimple(x: unknown):x is LogEntry {
    return typeof x==='object' && x!==null && "ulid" in x && "type" in x;
}

export type BaseLogEntry<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> = {
    
    /**
     * The Universally Unique Lexicographically Sortable Identifier. 
     * 
     * An id that if sorted, will be in time order (and is extremely unlikely to collide even on the same millisecond, even in distributed systems). 
     */
    ulid: string,

    /**
     * Entry timestamp.
     * 
     * You can discard this to save space, and instead use decodeTime from the 'ulid' package, on the .ulid property.
     */
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
export type StartEventDetail = BaseEventDetail & {
    name: 'span_start'
}
type EndEventDetail = BaseEventDetail & {
    name: 'span_end'
}
export type EventDetail = StartEventDetail | EndEventDetail;

export type EventLogEntry<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext, E extends EventDetail = EventDetail> = BaseLogEntry<T, M> & {
    type: 'event',
    message?: string
    event: E
};

export function isEventLogEntry(x: unknown): x is EventLogEntry<any, any> {
    return (typeof x==='object') && !!x && "type" in x && x.type==='event';
}

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
  | (Omit<InfoLogEntry<T, M>, 'context' | 'stack_trace' | 'timestamp' | 'ulid'> & { context?: T, ulid?: string })
  | (Omit<WarnLogEntry<T, M>, 'context' | 'stack_trace' | 'timestamp' | 'ulid'> & { context?: T, ulid?: string })
  | (Omit<ErrorLogEntry<T, M>, 'context' | 'stack_trace' | 'timestamp' | 'ulid'> & { context?: T, ulid?: string })
  | (Omit<EventLogEntry<T, M>, 'context' | 'stack_trace' | 'timestamp' | 'ulid'> & { context?: T, ulid?: string });




export type LogEntryType = LogEntry['type'];

export interface IRawLogger<T extends MinimumContext = MinimumContext, M extends MinimumContext = MinimumContext> {

    breakpoints: IBreakpoints,

    /**
     * Add an entry to the data store
     * @param entry 
     */
    add(entry:AcceptLogEntry<T, M>):Promise<LogEntry<T>>;

    /**
     * Retrieve entries from the data store
     * @param filter Match any entries with a precise spec
     * @param fullTextFilter Match entries that, when serialised, contain this text 
     */
    get(filter?:WhereFilterDefinition<LogEntry<T, M>>, fullTextFilter?: string): Promise<LogEntry<T, M>[]>;

    /**
     * Remove items older than the max age stated in LoggerOptions
     */
    forceClearOldEntries(): Promise<void>;


    /**
     * Manually reset the database and populate it with the passed in entries 
     * @param entries 
     */
    reset(entries?:LogEntry<T>[]): Promise<void>;

}