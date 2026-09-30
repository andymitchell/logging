import { isTypeEqual, isTypeEqualLooseFunctions } from "@andymitchell/utils"
import { z } from "zod"
import { type ISpan, type SpanId, type SpanMeta } from "./types.ts"
import type { ILogger } from "../types.ts"


/**
 * One id in a `SpanId`: 1 to 64 letters, digits, `-` or `_`.
 *
 * Every id the library makes is a UUID, which fits. The bound is what lets {@link SpanIdSchema} vet a span id that
 * arrived from a less trusted side: an email, a long string, or anything with spaces or punctuation fails. That
 * matters because span ids are written to every entry's `meta`, which is never masked.
 */
const SpanIdPartSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/**
 * A span's identity: its own `id`, the `top_id` of its trace's root span, and its `parent_id` when it has a parent.
 *
 * It is also what crosses a boundary when a trace continues on the other side (e.g. from a web page to a browser
 * extension): the sender sends `span.getFullId()`, and the receiver checks it with this schema before passing it to
 * `continueTrace`. Each id must be a short token (1 to 64 letters, digits, `-` or `_`), so a value a sender made up to
 * smuggle an email or a huge string into the receiver's log is rejected.
 *
 * @example
 * const received = SpanIdSchema.safeParse(message.log_span);
 * const span = received.success
 *     ? continueTrace(logStorage, received.data).startSpan('Received at boundary')
 *     : startTrace('Received at boundary', undefined, logStorage);
 *
 * @see dec-span-ids-cross-boundaries-validated in spec/decisions.md, and "How to cross boundaries" in the README.
 */
export const SpanIdSchema = z.object({
    id: SpanIdPartSchema,
    top_id: SpanIdPartSchema,
    parent_id: SpanIdPartSchema.optional(),
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
    // Per-call-masking variants — keep in lockstep with ILogger or `isTypeEqualLooseFunctions` below fails `tsc`.
    debugWithOptions: FunctionSchema,
    logWithOptions: FunctionSchema,
    warnWithOptions: FunctionSchema,
    errorWithOptions: FunctionSchema,
    criticalWithOptions: FunctionSchema,
    get: FunctionSchema,
});

export const ISpanSchema = ILoggerSchema.extend({
    startSpan: FunctionSchema,
    startSpanWithOptions: FunctionSchema,
    end: FunctionSchema,
    getId: z.custom<() => string>((v) => typeof v === 'function'),
    getFullId: z.custom<() => SpanId>((v) => typeof v === 'function'),
});
isTypeEqualLooseFunctions<z.infer<typeof ILoggerSchema>, ILogger>(true);
isTypeEqualLooseFunctions<z.infer<typeof ISpanSchema>, ISpan>(true);

