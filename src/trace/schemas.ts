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


/**
 * A function member of a logger/span schema.
 *
 * Why: Zod 4 removed `z.function()` as a `ZodType` (it is now a standalone
 * function factory that cannot sit inside `z.object`). `z.custom` preserves the
 * v3 runtime contract — the member must be a function (`typeof === 'function'`) —
 * and a loose callable type. Return-typed members encode intent in the generic;
 * like v3, the return is not validated at parse time.
 */
const FunctionSchema = z.custom<(...args: any[]) => any>((v) => typeof v === 'function');

export const ILoggerSchema = z.object({
    debug: FunctionSchema,
    log: FunctionSchema,
    warn: FunctionSchema,
    error: FunctionSchema,
    critical: FunctionSchema,
    get: FunctionSchema,
});

export const ISpanSchema = ILoggerSchema.extend({
    startSpan: FunctionSchema,
    end: FunctionSchema,
    getId: z.custom<() => string>((v) => typeof v === 'function'),
    getFullId: z.custom<() => SpanId>((v) => typeof v === 'function'),
});
isTypeEqualLooseFunctions<z.infer<typeof ILoggerSchema>, ILogger>(true);
isTypeEqualLooseFunctions<z.infer<typeof ISpanSchema>, ISpan>(true);

