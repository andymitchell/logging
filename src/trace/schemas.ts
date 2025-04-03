import { isTypeEqual } from "@andyrmitchell/utils"
import { z } from "zod"
import { type SpanId, type SpanMeta } from "./types.ts"


export const SpanIdSchema = z.object({
    id: z.string(), 
    top_id: z.string(),
    parent_id: z.string().optional(),
})

export const SpanMetaSchema = z.object({
    type: z.literal('span'),
    span: SpanIdSchema
})


isTypeEqual<z.infer<typeof SpanIdSchema>, SpanId>(true);
isTypeEqual<z.infer<typeof SpanMetaSchema>, SpanMeta>(true);
