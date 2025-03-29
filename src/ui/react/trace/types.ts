import type {  TraceSearchResults } from "../../../trace/types.ts";
import type { TraceViewer } from "../../../trace/viewing/TraceViewer.ts";
import type {  TraceFilter } from "../../../trace/viewing/types.ts";
import type { MinimumContext } from "../../../types.ts";

export type GetTracesFn = <T extends MinimumContext = any>(
    filter?: TraceFilter<T>,
    includeAllTraceEntries?: boolean
) => Promise<TraceSearchResults<T>>;


/**
 * A flexible provider of traces
 */
export type TracesSource = TraceViewer | GetTracesFn;