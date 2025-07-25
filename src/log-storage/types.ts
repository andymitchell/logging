import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { IBreakpoints } from "../breakpoints/types.ts";
import type { MaxAge, MinimumContext } from "../types.ts";


/**
 * Test if the variable is a LogEntry. 
 * 
 * It's not an exhaustive zod-schema driven test, because trying to avoid requiring zod for this. 
 * @param x 
 */
export function isLogEntrySimple(x: unknown):x is LogEntry {
    return typeof x==='object' && x!==null && "ulid" in x && "type" in x;
}

export type BaseLogEntry<C = any, M extends MinimumContext = any> = {
    
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
type DebugLogEntry<C = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'debug',
    message: string
};
type InfoLogEntry<C = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'info',
    message: string
};
type WarnLogEntry<C = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'warn',
    message: string
};
type ErrorLogEntry<C = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'error',
    message: string
};
type CriticalLogEntry<C = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
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

export type EventLogEntry<C = any, M extends MinimumContext = any, E extends EventDetail = EventDetail> = BaseLogEntry<C, M> & {
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
export type LogEntry<C = any, M extends MinimumContext = any> = 
    DebugLogEntry<C, M> |
    InfoLogEntry<C, M> | 
    WarnLogEntry<C, M> | 
    ErrorLogEntry<C, M> |
    CriticalLogEntry<C, M> | 
    EventLogEntry<C, M>



/**
 * Like LogEntry, but context can be anything (not yet serialised down)
 */
export type AcceptLogEntry<C = any, M extends MinimumContext = any> =
  | (Omit<DebugLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<InfoLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<WarnLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<ErrorLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<CriticalLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<EventLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string });




export type LogEntryType = LogEntry['type'];

/**
 * The storage area for loggers. An implementation of this will always be passed into a Logger/Trace class. 
 */
export interface ILogStorage {

    breakpoints?: IBreakpoints | null,

    /**
     * Add an entry to the data store
     * @param entry 
     */
    add<T extends any>(entry:AcceptLogEntry<T>):Promise<LogEntry<T>>;

    /**
     * Retrieve entries from the data store
     * @param filter Match any entries with a precise spec
     * @param fullTextFilter Match entries that, when serialised, contain this text 
     */
    get<T extends LogEntry = LogEntry>(filter?:WhereFilterDefinition<T>, fullTextFilter?: string): Promise<T[]>;

    /**
     * Remove items older than the max age stated in LogStorageOptions
     */
    forceClearOldEntries(): Promise<void>;


    /**
     * Manually reset the database and populate it with the passed in entries 
     * @param entries 
     */
    reset(entries?:LogEntry[]): Promise<void>;

}

export interface LogStorageOptions {
    include_stack_trace?: {
        debug: boolean;
        info: boolean;
        warn: boolean;
        error: boolean;
        critical: boolean;
        event: boolean;
    };
    log_to_console?:boolean,

    /**
     * Cull logs based on age. Set different times for different filters (matching first found in array)
     * 
     * @example [{filter: {type: 'error'}, max_ms: dayMs*30}, {max_ms: dayMs*5}] 
     */
    max_age?: MaxAge,


    /**
     * Allow context properties that are prefixed with '_dangerous' to not be stripped of sensitive data. Useful to allow some tracking IDs through.
     */
    permit_dangerous_context_properties?: boolean,

    /**
     * Set a custom IBreakpoints implementation (e.g. a different storage area). Defaults to in-memory if not provided.
     */
    breakpoints?: IBreakpoints | null
}