import { isTypeEqual, isTypeEqualLooseFunctions } from "@andyrmitchell/utils"
import { z } from "zod"
import { type ISpan, type SpanId, type SpanMeta } from "./types.ts"
import type { ILogger } from "../types.ts"


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


export const ILoggerSchema = z.object({
    debug: z.function(),
    log: z.function(),
    warn: z.function(),
    error: z.function(),
    critical: z.function(),
    get: z.function(),
});

export const ISpanSchema = ILoggerSchema.extend({
    startSpan: z.function(),
    end: z.function(),
    getId: z.function().returns(z.string()),
    getFullId: z.function().returns(SpanIdSchema),
});
isTypeEqualLooseFunctions<z.infer<typeof ILoggerSchema>, ILogger>(true);
isTypeEqualLooseFunctions<z.infer<typeof ISpanSchema>, ISpan>(true);

