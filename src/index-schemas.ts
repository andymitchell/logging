import { createLogEntrySchema, LogEntrySchema } from "./raw-storage/schemas.ts";
import { createTraceEntriesSchema, SpanMetaSchema, TraceEntriesSchema } from "./trace/schemas.ts";

// Kept seperate to isolate heavy zod usage. 

export {
    LogEntrySchema,
    createLogEntrySchema,
}

export {
    SpanMetaSchema,
    TraceEntriesSchema,
    createTraceEntriesSchema
}