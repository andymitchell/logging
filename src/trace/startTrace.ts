import type { ILogStorage } from "../index-types.ts";
import type { LogCallMaskingOptions } from "../log-storage/types.ts";
import { Trace } from "./Trace.ts";
import type { ISpan } from "./types.ts";



/**
 * Helper function to create or extend a trace. 
 * 
 * If there's a current trace, create a new span on it. 
 * Otherwise start a new trace from the provided LogStorage
 * 
 * @param name The name of the new span.
 * @param context Optional. 
 * @param logStorage Optional. The ILogStorage from which to create a new Trace.
 * @param logSpan Optional. An existing trace/span. Will be extended with a new span. 
 * @returns 
 */
export function startTrace<T extends Record<string, any> = any>(name: string, context: T | undefined, logStorage: ILogStorage | undefined, logSpan: ISpan): ISpan;
export function startTrace<T extends Record<string, any> = any>(name: string, context: T | undefined, logStorage: ILogStorage, logSpan: ISpan | undefined): ISpan;
export function startTrace<T extends Record<string, any> = any>(name: string, context: T | undefined, logStorage: ILogStorage, logSpan?: undefined): ISpan;
export function startTrace<T extends Record<string, any> = any>(name: string, context?: T, logStorage?: undefined, logSpan?: undefined): undefined;
export function startTrace<T extends Record<string, any> = any>(name: string, context: T | undefined, logStorage: ILogStorage | undefined, logSpan: ISpan | undefined): ISpan | undefined;

export function startTrace<T extends Record<string, any> = any>(name: string, context?: T, logStorage?: ILogStorage, logSpan?: ISpan): ISpan | undefined {

    if (logSpan) {
        return logSpan.startSpan(name, context);
    } else if (logStorage) {
        return new Trace(logStorage, name, context);
    }

}


/**
 * Like {@link startTrace}, but a leading `options` may keep specific values in the new span/trace's OWN
 * context (the span_start entry) UNMASKED — gated by path AND value-shape, honored only by a storage with
 * `allow_per_call_unmasking`. Scope is the span's own context only; logs emitted later within it are NOT
 * affected.
 *
 * @param options Per-call masking directives for the span_start context. @see LogCallMaskingOptions
 * @param name The name of the new span.
 * @param context Optional.
 * @param logStorage Optional. The ILogStorage from which to create a new Trace.
 * @param logSpan Optional. An existing trace/span. Will be extended with a new span.
 */
export function startTraceWithOptions<C extends Record<string, any> = any>(options: LogCallMaskingOptions<C>, name: string, context: C | undefined, logStorage: ILogStorage | undefined, logSpan: ISpan): ISpan;
export function startTraceWithOptions<C extends Record<string, any> = any>(options: LogCallMaskingOptions<C>, name: string, context: C | undefined, logStorage: ILogStorage, logSpan: ISpan | undefined): ISpan;
export function startTraceWithOptions<C extends Record<string, any> = any>(options: LogCallMaskingOptions<C>, name: string, context: C | undefined, logStorage: ILogStorage, logSpan?: undefined): ISpan;
export function startTraceWithOptions<C extends Record<string, any> = any>(options: LogCallMaskingOptions<C>, name: string, context?: C, logStorage?: undefined, logSpan?: undefined): undefined;
export function startTraceWithOptions<C extends Record<string, any> = any>(options: LogCallMaskingOptions<C>, name: string, context: C | undefined, logStorage: ILogStorage | undefined, logSpan: ISpan | undefined): ISpan | undefined;

export function startTraceWithOptions<C extends Record<string, any> = any>(options: LogCallMaskingOptions<C>, name: string, context?: C, logStorage?: ILogStorage, logSpan?: ISpan): ISpan | undefined {

    if (logSpan) {
        return logSpan.startSpanWithOptions(options, name, context);
    } else if (logStorage) {
        // Widen the C-narrowed directive to Trace's non-generic carrier (sound; typed paths stay at this call site).
        return new Trace(logStorage, name, context, options as LogCallMaskingOptions);
    }

}