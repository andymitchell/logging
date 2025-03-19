import { isTypeEqual } from "@andyrmitchell/utils"
import { z } from "zod"
import { type TraceId, type SpanMeta, type TraceResults } from "./types.ts"
import { createLogEntrySchema } from "../index-schemas.ts"

export const TraceIdSchema = z.object({
    id: z.string(), 
    top_id: z.string(),
    parent_id: z.string().optional(),
})

export const SpanMetaSchema = z.object({
    type: z.literal('span'),
    trace: TraceIdSchema,
    name: z.string().optional()
})

export function createTraceResultsSchema(context?:z.RecordType<any, any>) {
    return z.array(z.object({
        id: z.string(),
        timestamp: z.number(),
        all: z.array(createLogEntrySchema(context, SpanMetaSchema)),
        matches: z.array(createLogEntrySchema(context, SpanMetaSchema)),
    }));
}

export const TraceResultsSchema = createTraceResultsSchema();


isTypeEqual<z.infer<typeof TraceIdSchema>, TraceId>(true);
isTypeEqual<z.infer<typeof SpanMetaSchema>, SpanMeta>(true);
isTypeEqual<z.infer<typeof TraceResultsSchema>, TraceResults>(true);