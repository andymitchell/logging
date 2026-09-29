
import type { ILogStorage } from "../../index-browser.ts";
import type { MinimumContext } from "../../types.ts";

import { getTraces } from "./getTraces.ts";
import type { GetTracesResult, ITraceViewer, TraceFilter } from "./types.ts";

/**
 * Attach to a raw logger and retrieve traces.
 *
 * @example
 * const r = await new TraceViewer(storage).getTraces();
 * setTraces(r.traces);
 * setBroken(r.error?.failures.map(f => f.source) ?? []);
 */
export class TraceViewer implements ITraceViewer {
    protected rawLogger: ILogStorage;

    constructor(rawLogger:ILogStorage) {
        this.rawLogger = rawLogger;
    }

    getTraces<T extends MinimumContext = any>(filter?: TraceFilter<T>, includeAllTraceEntries?: boolean): Promise<GetTracesResult<T>> {
        return getTraces(this.rawLogger, filter, includeAllTraceEntries);
    }
}
