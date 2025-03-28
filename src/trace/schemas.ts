import { isTypeEqual } from "@andyrmitchell/utils"
import { z } from "zod"
import { type SpanId, type SpanMeta, type TraceSearchResults } from "./types.ts"
import { createLogEntrySchema } from "../index-schemas.ts"

export const SpanIdSchema = z.object({
    id: z.string(), 
    top_id: z.string(),
    parent_id: z.string().optional(),
})

export const SpanMetaSchema = z.object({
    type: z.literal('span'),
    span: SpanIdSchema
})

export function createTraceSearchResultsSchema(context?:z.RecordType<any, any>) {
    return z.array(z.object({
        id: z.string(),
        timestamp: z.number(),
        logs: z.array(createLogEntrySchema(context, SpanMetaSchema)),
        matches: z.array(createLogEntrySchema(context, SpanMetaSchema)),
    }));
}

export const TraceSearchResultsSchema = createTraceSearchResultsSchema();


isTypeEqual<z.infer<typeof SpanIdSchema>, SpanId>(true);
isTypeEqual<z.infer<typeof SpanMetaSchema>, SpanMeta>(true);
isTypeEqual<z.infer<typeof TraceSearchResultsSchema>, TraceSearchResults>(true);