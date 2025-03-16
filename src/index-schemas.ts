import { createLogEntrySchema, LogEntrySchema } from "./raw-storage/schemas.ts";
import {  createTraceResultsSchema, SpanMetaSchema, TraceResultsSchema } from "./trace/schemas.ts";

// Kept seperate to isolate heavy zod usage. 

export {
    LogEntrySchema,
    createLogEntrySchema,
}

export {
    SpanMetaSchema,
    TraceResultsSchema,
    createTraceResultsSchema
}