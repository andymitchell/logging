import { Logger } from "./Logger.ts";
import { IDBLogger } from "./raw-storage/idb/IDBLogger.ts";
import { MemoryLogger } from "./raw-storage/memory/MemoryLogger.ts";
import type { IRawLogger } from "./raw-storage/types.ts";
import { Span } from "./trace/Span.ts";
import { Trace } from "./trace/Trace.ts";
import type { ILogger, LoggerOptions } from "./types.ts";

import { getTraces, getCommonTraces } from "./trace/getTraces.ts";

export {
    Trace,
    Span,
    Logger,
    getTraces,
    getCommonTraces

}


export {
    MemoryLogger,
    IDBLogger
}


export type {
    IRawLogger,
    ILogger,
    LoggerOptions
}