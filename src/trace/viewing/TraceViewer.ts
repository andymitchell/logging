

import type { ILogStorage } from "../../index-browser.ts";
import type { MinimumContext } from "../../types.ts";

import { getTraces } from "./getTraces.ts";
import type { ITraceViewer, TraceFilter, TraceSearchResults } from "./types.ts";

/**
 * Attach to a raw logger and retrieve traces 
 */
export class TraceViewer implements ITraceViewer {
    protected rawLogger: ILogStorage;

    constructor(rawLogger:ILogStorage) {
        this.rawLogger = rawLogger;
    }

    getTraces<T extends MinimumContext = any>(filter?: TraceFilter<T>, includeAllTraceEntries?: boolean): Promise<TraceSearchResults<T>> {
        return getTraces(this.rawLogger, filter, includeAllTraceEntries);
    }
}