
import type { ILogStorage, LogCallMaskingOptions, LogEntry, LogStorageOptions } from "./log-storage/types.ts";

import type { ISpan, SpanId, SpanMeta, TraceEntry } from "./trace/types.ts";


import type { ILogger, MinimumContext } from "./types.ts";

import type { LogReadResult, LogWriteResult, LoggingError, LoggingFailedResult, LoggingFailure, LoggingFailureListener, LoggingOkResult, LoggingOperation, LoggingResult } from "./failures/types.ts";

// Re-exported so consumers can type `preserve_unmasked_context_paths` entries without importing
// @andymitchell/clone-to-json-safe directly. That package remains the single source of truth for the shape.
import type { PreservableValueShape, PreserveUnmaskedPath } from "@andymitchell/clone-to-json-safe";

export type {
    ILogStorage,
    ILogStorage as IRawLogger, // Deprecated
    ILogger,
    LogStorageOptions,
    LogStorageOptions as LoggerOptions, // Deprecated
    LogCallMaskingOptions,
    SpanId,
    ISpan,
    MinimumContext,
    LogEntry,
    SpanMeta,
    TraceEntry,
    PreservableValueShape,
    PreserveUnmaskedPath,
    LoggingResult,
    LoggingOkResult,
    LoggingOkResult as LoggingOk, // Deprecated
    LoggingFailedResult,
    LoggingFailedResult as LoggingFailed, // Deprecated
    LogWriteResult,
    LogReadResult,
    LoggingError,
    LoggingFailure,
    LoggingOperation,
    LoggingFailureListener
}
