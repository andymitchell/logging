import { createLogEntrySchema, LogEntrySchema } from "./log-storage/schemas.ts";
import {  SpanMetaSchema, SpanIdSchema, ILoggerSchema, ISpanSchema } from "./trace/schemas.ts";
import { createTraceSearchResultsSchema, TraceFilterSchema, TraceSearchResultsSchema } from "./trace/viewing/schemas.ts";

// Kept seperate to isolate heavy zod usage. 

export {
    LogEntrySchema,
    createLogEntrySchema,
}

export {
    SpanIdSchema,
    SpanMetaSchema,
    TraceSearchResultsSchema,
    createTraceSearchResultsSchema,
    TraceFilterSchema,
    ILoggerSchema,
    ISpanSchema
}