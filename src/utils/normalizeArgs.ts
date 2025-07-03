import type { InferContextTypeFromLogArgs } from "../types.ts";



/**
 * The result of normalizeArgs, now generic over the context type.
 */
export interface NormalizedLogArgs<TContext = any> {
    message: string;
    context: TContext;
}



/**
 * Normalizes the varied arguments of a log function call into a consistent
 * { message: string, context: any } object.
 * 
 * - The first item (message) will be stringified 
 * - A single additional item will be returned as is (context)
 * - If there are multiple additional items, the context will be an array 
 *
 * @param args - The arguments array from a function call, e.g. to .log
 * @returns An object containing a stringified message and a structured context.
 * 
 * @example normalizeArgs('hello') // {message: 'hello', context: undefined}
 * @example normalizeArgs('hello', {a: 1}) // {message: 'hello', context: {a: 1}}
 * @example normalizeArgs('hello', {a: 1}, {b: 2}) // {message: 'hello', context: [{a: 1}, {b: 2}]}
 * @example normalizeArgs({c: 3}) // {message: '{"c": 3}', context: undefined} note it was turned to json
 */
export function normalizeArgs<T extends any[]>(args:[...T]): NormalizedLogArgs<InferContextTypeFromLogArgs<T>> {
    console.log({args})
    const message = args.shift() as any;
    const context = args; // The remaining args after message removed 

    let finalMessage: string;

    // --- 1. Robustly stringify the first argument (`message`) ---

    // Handle null and undefined first, as they don't have .toString() or may cause issues
    if (message === null) {
        finalMessage = 'null';
    } else if (typeof message === 'undefined') {
        finalMessage = 'undefined';
    }
    // Specifically handle Error objects to get the most useful output (the stack)
    else if (message instanceof Error) {
        finalMessage = `${message.message}\n\nStack:\n${message.stack}`;
    }
    // For other objects, attempt a safe JSON stringification
    else if (typeof message === 'object') {
        try {
            // Pretty-print with an indent of 2 spaces for readability in logs
            finalMessage = JSON.stringify(message, null, 2);
        } catch (error) {
            // This catches circular references or other serialization errors
            console.error("Failed to stringify log message object. It may contain circular references.", error);
            finalMessage = '[Unserializable Object]';
        }
    }
    // For functions, provide a clear placeholder
    else if (typeof message === 'function') {
        finalMessage = `[Function: ${message.name || 'anonymous'}]`;
    }
    // For all other primitives (string, number, boolean, BigInt, Symbol), .toString() is safe
    else {
        try {
           finalMessage = message.toString();
        } catch (e) {
            console.error("Failed to convert log message to string.", e);
            finalMessage = '[Unstringifiable value]';
        }
    }

    // --- 2. Determine the final context based on the number of remaining arguments ---

    let finalContext: any;

    if (context.length === 0) {
        // No extra arguments, so context is undefined.
        finalContext = undefined;
    } else if (context.length === 1) {
        // Exactly one extra argument, it becomes the context.
        finalContext = context[0];
    } else {
        // More than one extra argument, the array of those arguments is the context.
        finalContext = context;
    }

    return {
        message: finalMessage,
        context: finalContext,
    };
}
