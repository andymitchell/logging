import { createLogEntrySchema, LogEntrySchema } from "./raw-storage/schemas.ts";
import {  createTraceSearchResultsSchema, SpanMetaSchema, SpanIdSchema, TraceSearchResultsSchema } from "./trace/schemas.ts";

// Kept seperate to isolate heavy zod usage. 

export {
    LogEntrySchema,
    createLogEntrySchema,
}

export {
    SpanIdSchema,
    SpanMetaSchema,
    TraceSearchResultsSchema,
    createTraceSearchResultsSchema
}