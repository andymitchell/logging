import { isTypeEqual } from "@andyrmitchell/utils"
import { z } from "zod"
import { type TraceId, type SpanMeta } from "./types.ts"
import { createLogEntrySchema } from "../index-schemas.ts"

export const TraceIdSchema = z.object({
    id: z.string(), 
    top_id: z.string(),
    parent_id: z.string().optional(),
})

export const SpanMetaSchema = z.object({
    trace: TraceIdSchema,
    name: z.string().optional()
})

export function createTraceEntriesSchema(context?:z.RecordType<any, any>) {
    return z.record(createLogEntrySchema(context, SpanMetaSchema));
}

export const TraceEntriesSchema = createTraceEntriesSchema();

isTypeEqual<z.infer<typeof TraceIdSchema>, TraceId>(true);
isTypeEqual<z.infer<typeof SpanMetaSchema>, SpanMeta>(true);