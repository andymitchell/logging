import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type {  LogEntry } from "./log-storage/types.ts";


export type MinimumContext = Record<string, any>;

export interface ILogger {

    
    debug(message: any, ...context: any[]): Promise<LogEntry>;

    log(message: any, ...context: any[]): Promise<LogEntry>;
    

    
    warn(message: any, ...context: any[]): Promise<LogEntry>;
    
    
    error(message: any, ...context: any[]): Promise<LogEntry>;

    
    critical(message: any, ...context: any[]): Promise<LogEntry>;

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

