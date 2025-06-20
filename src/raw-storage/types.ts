import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { IBreakpoints } from "../breakpoints/types.ts";
import type { MinimumContext } from "../types.ts";


/**
 * Test if the variable is a LogEntry. 
 * 
 * It's not an exhaustive zod-schema driven test, because trying to avoid requiring zod for this. 
 * @param x 
 */
export function isLogEntrySimple(x: unknown):x is LogEntry {
    return typeof x==='object' && x!==null && "ulid" in x && "type" in x;
}

export type BaseLogEntry<C extends MinimumContext = any, M extends MinimumContext = any> = {
    
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
    context?: C, //DeepSerializable<any>,

    /**
     * Internal data used by the logging system. Does not get security-reduced. Use for things like Span ID.
     */
    meta?: M,
    
    stack_trace?: string
}
type InfoLogEntry<C extends MinimumContext = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'info',
    message: string
};
type WarnLogEntry<C extends MinimumContext = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'warn',
    message: string
};
type ErrorLogEntry<C extends MinimumContext = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'error',
    message: string
};
type CriticalLogEntry<C extends MinimumContext = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'critical',
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

export type EventLogEntry<C extends MinimumContext = any, M extends MinimumContext = any, E extends EventDetail = EventDetail> = BaseLogEntry<C, M> & {
    type: 'event',
    message?: string
    event: E
};

export function isEventLogEntry(x: unknown): x is EventLogEntry {
    return (typeof x==='object') && !!x && "type" in x && x.type==='event';
}

/**
 * Union of all possible entry types
 */
export type LogEntry<C extends MinimumContext = any, M extends MinimumContext = any> = 
    InfoLogEntry<C, M> | 
    WarnLogEntry<C, M> | 
    ErrorLogEntry<C, M> |
    CriticalLogEntry<C, M> | 
    EventLogEntry<C, M>



/**
 * Like LogEntry, but context can be anything (not yet serialised down)
 */
export type AcceptLogEntry<C extends MinimumContext = any, M extends MinimumContext = any> =
  | (Omit<InfoLogEntry<C, M>, 'stack_trace' | 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<WarnLogEntry<C, M>, 'stack_trace' | 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<ErrorLogEntry<C, M>, 'stack_trace' | 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<CriticalLogEntry<C, M>, 'stack_trace' | 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<EventLogEntry<C, M>, 'stack_trace' | 'timestamp' | 'ulid'> & { ulid?: string });




export type LogEntryType = LogEntry['type'];

/**
 * The storage area for loggers. An implementation of this will always be passed into a Logger/Trace class. 
 */
export interface IRawLogger {

    breakpoints: IBreakpoints,

    /**
     * Add an entry to the data store
     * @param entry 
     */
    add(entry:AcceptLogEntry):Promise<LogEntry>;

    /**
     * Retrieve entries from the data store
     * @param filter Match any entries with a precise spec
     * @param fullTextFilter Match entries that, when serialised, contain this text 
     */
    get(filter?:WhereFilterDefinition<LogEntry>, fullTextFilter?: string): Promise<LogEntry[]>;

    /**
     * Remove items older than the max age stated in LoggerOptions
     */
    forceClearOldEntries(): Promise<void>;


    /**
     * Manually reset the database and populate it with the passed in entries 
     * @param entries 
     */
    reset(entries?:LogEntry[]): Promise<void>;

}