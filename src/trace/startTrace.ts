import type { ILogStorage } from "../index-types.ts";
import { Trace } from "./Trace.ts";
import type { ISpan } from "./types.ts";


// Overload 1: A logSpan is provided. This is the most specific case and guarantees an ISpan is returned.
export function startTrace<T extends Record<string, any> = any>(name: string, context: T | undefined, logStorage: ILogStorage | undefined, logSpan: ISpan): ISpan;

// Overload 2: A logStorage is provided (but no logSpan). This also guarantees an ISpan is returned.
export function startTrace<T extends Record<string, any> = any>(name: string, context: T | undefined, logStorage: ILogStorage, logSpan?: undefined): ISpan;

// Overload 3: Neither is provided, so the function does nothing and returns undefined.
export function startTrace<T extends Record<string, any> = any>(name: string, context?: T, logStorage?: undefined, logSpan?: undefined): undefined;

/**
 * Helper function to create or extend a trace. 
 * 
 * If there's a current trace, create a new span on it. 
 * Otherwise start a new trace from the provided LogStorage
 * 
 * Create a new trace from LogStorage, or if there's currently a trace extend it into a new span. 
 * @param name 
 * @param context 
 * @param logSpan 
 * @returns 
 */
export function startTrace<T extends Record<string, any> = any>(name: string, context?: T, logStorage?: ILogStorage, logSpan?: ISpan): ISpan | undefined {

    if (logSpan) {
        return logSpan.startSpan(name, context);
    } else if (logStorage) {
        return new Trace(logStorage, name, context);
    }

}