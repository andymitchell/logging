
import type { IRawLogger } from "../../index-browser.ts";
import type { MinimumContext } from "../../types.ts";
import type { TraceResults} from "../types.ts";
import { getTraces } from "./getTraces.ts";
import type { ITraceViewer, TraceEntryFilter } from "./types.ts";

/**
 * Attach to a raw logger and retrieve traces 
 */
export class TraceViewer implements ITraceViewer {
    protected rawLogger: IRawLogger;

    constructor(rawLogger:IRawLogger) {
        this.rawLogger = rawLogger;
    }

    getTraces<T extends MinimumContext = any>(traceEntryFilter?:TraceEntryFilter<T>): Promise<TraceResults<T>> {
        return getTraces(this.rawLogger, traceEntryFilter);
    }
}