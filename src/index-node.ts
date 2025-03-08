import { Logger } from "./Logger.ts";
import { MemoryLogger } from "./raw-storage/memory/MemoryLogger.ts";
import type { IRawLogger } from "./raw-storage/types.ts";
import { Span } from "./trace/Span.ts";
import { Trace } from "./trace/Trace.ts";

import { getTraces, getCommonTraces } from "./trace/getTraces.ts";
import type { ILogger, LoggerOptions } from "./types.ts";

export {
    Trace,
    Span,
    Logger,
    getTraces,
    getCommonTraces

}


export {
    MemoryLogger
}


export type {
    IRawLogger,
    ILogger,
    LoggerOptions
}