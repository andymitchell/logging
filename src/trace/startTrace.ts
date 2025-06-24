import type { ILogStorage } from "../index-types.ts";
import { Trace } from "./Trace.ts";
import type { ISpan } from "./types.ts";



export function startTrace<T extends Record<string, any> = any>(name: string, context: T | undefined, logStorage: ILogStorage | undefined, logSpan: ISpan): ISpan;
export function startTrace<T extends Record<string, any> = any>(name: string, context: T | undefined, logStorage: ILogStorage, logSpan: ISpan | undefined): ISpan;
export function startTrace<T extends Record<string, any> = any>(name: string, context: T | undefined, logStorage: ILogStorage, logSpan?: undefined): ISpan;
export function startTrace<T extends Record<string, any> = any>(name: string, context?: T, logStorage?: undefined, logSpan?: undefined): undefined;
export function startTrace<T extends Record<string, any> = any>(name: string, context: T | undefined, logStorage: ILogStorage | undefined, logSpan: ISpan | undefined): ISpan | undefined;

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