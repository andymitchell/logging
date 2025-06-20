
import type { ILogStorage, LogEntry, LogStorageOptions } from "./log-storage/types.ts";

import type { ISpan, SpanId, SpanMeta, TraceEntry } from "./trace/types.ts";


import type { ILogger, MinimumContext } from "./types.ts";

export type {
    ILogStorage,
    ILogStorage as IRawLogger, // Deprecated
    ILogger,
    LogStorageOptions,
    LogStorageOptions as LoggerOptions, // Deprecated
    SpanId,
    ISpan,
    MinimumContext,
    LogEntry,
    SpanMeta,
    TraceEntry
}
