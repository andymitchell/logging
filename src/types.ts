import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { LogCallMaskingOptions, LogEntry } from "./log-storage/types.ts";
import type { LogReadResult, LogWriteResult } from "./failures/types.ts";


export type MinimumContext = Record<string, any>;

/**
 * Something that records log entries, e.g. a `Logger` or a span.
 *
 * Logging never breaks the caller's control flow: every write resolves a {@link LogWriteResult} and never
 * throws or rejects, whatever the store does or whatever value is logged. Awaiting a write means the store
 * committed the entry or failed to; not awaiting it is safe.
 *
 * @example
 * const r = await logger.warn('slow response', { ms });
 * if (r.error) reportLoggingBroken(r.error); // plain JSON
 */
export interface ILogger {

    /**
     * Record a `debug` entry.
     *
     * @param message Stringified to become the entry's message (an Error keeps its message and stack).
     * @param context One value becomes the entry's context; several become an array.
     * @returns `{ ok: true, entry }`, or `{ ok: false, entry?, error }`. Never rejects.
     */
    debug<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>>>;
    /** Record an `info` entry. Like {@link ILogger.debug} otherwise. */
    log<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>>>;
    /** Record a `warn` entry. Like {@link ILogger.debug} otherwise. */
    warn<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>>>;
    /** Record an `error` entry. Like {@link ILogger.debug} otherwise. */
    error<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>>>;
    /** Record a `critical` entry. Like {@link ILogger.debug} otherwise. */
    critical<T extends any[]>(message: any, ...context: T): Promise<LogWriteResult<InferContextTypeFromLogArgsWithoutMessage<T>>>;


    /**
     * Like {@link ILogger.debug}, but a leading `options` may keep specific context values UNMASKED for this
     * one log — gated by path AND value-shape (fail-closed) and honored only by a storage with
     * `allow_per_call_unmasking`. A separate method with options in the LEADING positional slot, never a
     * sniffed argument, so a logged value can never be mistaken for options. @see LogCallMaskingOptions
     */
    debugWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C>>;
    /** Like {@link ILogger.log}, with per-call masking options in the leading slot. @see LogCallMaskingOptions */
    logWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C>>;
    /** Like {@link ILogger.warn}, with per-call masking options in the leading slot. @see LogCallMaskingOptions */
    warnWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C>>;
    /** Like {@link ILogger.error}, with per-call masking options in the leading slot. @see LogCallMaskingOptions */
    errorWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C>>;
    /** Like {@link ILogger.critical}, with per-call masking options in the leading slot. @see LogCallMaskingOptions */
    criticalWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogWriteResult<C>>;


    /**
     * Read entries from the store this writes to.
     *
     * @param filter Match entries against this where-filter; all entries if omitted.
     * @returns `{ ok: true, entries }`, or `{ ok: false, entries, error }` where `entries` holds whatever
     * could still be read. Never rejects.
     */
    get(filter?:WhereFilterDefinition<LogEntry>): Promise<LogReadResult>;

}

/**
 * Remove LogEntry if they match the filter and are older than the max_ms. 
 * 
 * It tests the filters in array order, and will only use the first match. 
 * 
 * Leave the filter empty as a catch all. 
 */
export type MaxAge = {
    filter?: WhereFilterDefinition<LogEntry>,
    max_ms: number
}[]





/**
 * A conditional type that infers the shape of the `context` based on the
 * arguments tuple `T`, where the first argument is expected to be the message. 
 *
 * - If `T` has 0 or 1 element (message only), context is `undefined`.
 * - If `T` has 2 elements (message + 1 context), context is the type of the 2nd element.
 * - If `T` has >2 elements (message + multiple contexts), context is a tuple of the remaining elements.
 * 
 * @example 
 * declare log<T extends any[]>(...args: T): InferContextType<T>
 * log('message', {con:1}) // return type is {con: 1}
 */
export type InferContextTypeFromLogArgs<T extends any[]> =
    T extends [any] // Case 1: Only a message, no context args.
        ? undefined
    : T extends [any, infer C] // Case 2: Message and ONE context arg.
        ? C
    : T extends [any, ...infer R] // Case 3: Message and MULTIPLE context args.
        ? R
        : undefined; // Fallback for empty or invalid args.

/**
 * Same as InferContextTypeFromLogArgs, but its expecting the message to be omitted
 * 
 * 
 * @example 
 * declare log<T extends any[]>(message: any, ...args: T): InferContextTypeFromLogArgsWithoutMessage<T>
 * log('message', {con:1}) // return type is {con: 1}
 * 
 */
export type InferContextTypeFromLogArgsWithoutMessage<T extends any[]> =
    T extends [] // Case 1: Only a message, no context args.
        ? undefined
    : T extends [infer C] // Case 2: Message and ONE context arg.
        ? C
    : T extends [...infer R] // Case 3: Message and MULTIPLE context args.
        ? R
        : undefined; // Fallback for empty or invalid args.

