import { z } from "zod";
import { isTypeEqual } from "@andymitchell/utils";
import type { LogEntry } from "./types.ts";
import { LOG_ENTRY_FORMAT_VERSION } from "./format/version.ts";


/**
 * Create a schema for a log entry in the current format, optionally narrowing `context` and `meta`.
 *
 * `context` and `meta` accept anything by default: a store holds whatever was logged (a string, an array, an
 * object), and a channel records `'redact:uncopyable'` in place of a value it cannot copy. Pass a schema to
 * narrow either. `format_version` must be the current {@link LOG_ENTRY_FORMAT_VERSION}, so an entry written by
 * an older or newer library does not parse.
 *
 * @param context - Schema for the `context` of every entry. Defaults to anything.
 * @param meta - Schema for the `meta` of every entry. Defaults to anything.
 * @returns A discriminated union on `type` covering every kind of entry.
 *
 * @example
 * const SpanEntrySchema = createLogEntrySchema(undefined, SpanMetaSchema);
 * SpanEntrySchema.safeParse(entry).success; // false when `meta` is not a span's ids
 */
export function createLogEntrySchema(context?:z.ZodType<any>, meta?:z.ZodType<any>) {
    context = context ?? z.any();
    meta = meta ?? z.any();

    const BaseLogEntrySchema = z.object({
        ulid: z.string(),
        timestamp: z.number(),
        format_version: z.literal(LOG_ENTRY_FORMAT_VERSION),
        context: context.optional(),
        meta: meta.optional(),
        stack_trace: z.string().optional()
    });
    

    const DebugLogEntrySchema = BaseLogEntrySchema.extend({
        type: z.literal("debug"),
        message: z.string()
    });

    const InfoLogEntrySchema = BaseLogEntrySchema.extend({
        type: z.literal("info"),
        message: z.string()
    });
    
    const WarnLogEntrySchema = BaseLogEntrySchema.extend({
        type: z.literal("warn"),
        message: z.string()
    });
    
    const ErrorLogEntrySchema = BaseLogEntrySchema.extend({
        type: z.literal("error"),
        message: z.string()
    });
    
    const CriticalLogEntrySchema = BaseLogEntrySchema.extend({
        type: z.literal("critical"),
        message: z.string()
    });
    
    const BaseEventDetailSchema = z.object({
        name: z.string()
    });
    
    const StartEventDetailSchema = BaseEventDetailSchema.extend({
        name: z.literal("span_start")
    });
    
    const EndEventDetailSchema = BaseEventDetailSchema.extend({
        name: z.literal("span_end")
    });
    
    const EventDetailSchema = z.discriminatedUnion("name", [
        StartEventDetailSchema,
        EndEventDetailSchema
    ]);
    
    const EventLogEntrySchema = BaseLogEntrySchema.extend({
        type: z.literal("event"),
        message: z.string().optional(),
        event: EventDetailSchema
    });
    
    const LogEntrySchema = z.discriminatedUnion("type", [
        DebugLogEntrySchema,
        InfoLogEntrySchema,
        WarnLogEntrySchema,
        ErrorLogEntrySchema,
        CriticalLogEntrySchema,
        EventLogEntrySchema
    ]);

    return LogEntrySchema;
}

/**
 * A log entry in the current format, with any `context` and `meta`.
 *
 * Whatever a store records parses under it, and a store only returns entries that do: it is the check a store
 * uses to decide whether a record it holds is a current entry.
 */
export const LogEntrySchema = createLogEntrySchema();

// Verify it matches the type. `context` and `meta` are `any` on both sides, so this cannot catch a mismatch there.
isTypeEqual<z.infer<typeof LogEntrySchema>, LogEntry>(true);

export function isLogEntry(x: unknown): x is LogEntry {
    return LogEntrySchema.safeParse(x).success;
}