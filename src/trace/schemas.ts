import { isTypeEqual } from "@andyrmitchell/utils"
import { z } from "zod"
import { type TraceId, type SpanContext } from "./types.ts"

export const TraceIdSchema = z.object({
    id: z.string(), 
    top_id: z.string(),
    parent_id: z.string().optional(),
})

export const SpanContextSchema = z.object({
    trace: TraceIdSchema,
    name: z.string().optional()
})

isTypeEqual<z.infer<typeof TraceIdSchema>, TraceId>(true);
isTypeEqual<z.infer<typeof SpanContextSchema>, SpanContext>(true);