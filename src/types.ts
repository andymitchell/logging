import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { LogCallMaskingOptions, LogEntry } from "./log-storage/types.ts";


export type MinimumContext = Record<string, any>;

export interface ILogger {

    
    debug<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>>>;
    log<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>>>;
    warn<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>>>;
    error<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>>>;
    critical<T extends any[]>(message: any, ...context: T): Promise<LogEntry<InferContextTypeFromLogArgsWithoutMessage<T>>>;


    /**
     * Like {@link ILogger.debug}, but a leading `options` may keep specific context values UNMASKED for this
     * one log — gated by path AND value-shape (fail-closed) and honored only by a storage with
     * `allow_per_call_unmasking`. A separate method with options in the LEADING positional slot, never a
     * sniffed argument, so a logged value can never be mistaken for options. @see LogCallMaskingOptions
     */
    debugWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C>>;
    /** Like {@link ILogger.log}, with per-call masking options in the leading slot. @see LogCallMaskingOptions */
    logWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C>>;
    /** Like {@link ILogger.warn}, with per-call masking options in the leading slot. @see LogCallMaskingOptions */
    warnWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C>>;
    /** Like {@link ILogger.error}, with per-call masking options in the leading slot. @see LogCallMaskingOptions */
    errorWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C>>;
    /** Like {@link ILogger.critical}, with per-call masking options in the leading slot. @see LogCallMaskingOptions */
    criticalWithOptions<C extends MinimumContext>(options: LogCallMaskingOptions<C>, message: any, context: C): Promise<LogEntry<C>>;


    get(filter?:WhereFilterDefinition<LogEntry>): Promise<LogEntry[]>;

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

