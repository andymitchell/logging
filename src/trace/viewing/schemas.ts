import { z } from "zod";
import { createLogEntrySchema } from "../../raw-storage/schemas.ts";
import { SpanMetaSchema } from "../schemas.ts";
import type { TraceFilter, TraceSearchResults } from "./types.ts";
import { isTypeEqual } from "@andyrmitchell/utils";
import { WhereFilterSchema } from "@andyrmitchell/objects/where-filter";

export function createTraceSearchResultsSchema(context?:z.RecordType<any, any>) {
    return z.array(z.object({
        id: z.string(),
        timestamp: z.number(),
        logs: z.array(createLogEntrySchema(context, SpanMetaSchema)),
        matches: z.array(createLogEntrySchema(context, SpanMetaSchema)),
    }));
}

export const TraceSearchResultsSchema = createTraceSearchResultsSchema();


isTypeEqual<z.infer<typeof TraceSearchResultsSchema>, TraceSearchResults>(true);


export const TraceFilterSchema = z.object({
    entries: WhereFilterSchema.optional(),
    results:  WhereFilterSchema.optional(),
    entries_full_text: z.string().optional()
})
isTypeEqual<z.infer<typeof TraceFilterSchema>, TraceFilter>(true);
