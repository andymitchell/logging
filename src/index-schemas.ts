import { createLogEntrySchema, LogEntrySchema } from "./raw-storage/schemas.ts";
import {  createTraceResultsSchema, SpanMetaSchema, TraceIdSchema, TraceResultsSchema } from "./trace/schemas.ts";

// Kept seperate to isolate heavy zod usage. 

export {
    LogEntrySchema,
    createLogEntrySchema,
}

export {
    TraceIdSchema,
    SpanMetaSchema,
    TraceResultsSchema,
    createTraceResultsSchema
}