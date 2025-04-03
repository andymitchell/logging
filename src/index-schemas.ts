import { createLogEntrySchema, LogEntrySchema } from "./raw-storage/schemas.ts";
import {  SpanMetaSchema, SpanIdSchema } from "./trace/schemas.ts";
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
    TraceFilterSchema
}