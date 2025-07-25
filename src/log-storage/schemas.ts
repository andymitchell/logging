import { z } from "zod";
import { isTypeEqual } from "@andyrmitchell/utils";
import type { LogEntry } from "./types.ts";


/**
 * Create a schema for the log entry, optionally specifying the context and meta types (otherwise they accept any)
 * 
 * @param context 
 * @param meta 
 * @returns 
 */
export function createLogEntrySchema(context?:z.RecordType<any, any>, meta?:z.RecordType<any, any>) {
    context = context ?? z.record(z.string(), z.any());
    meta = meta ?? z.record(z.string(), z.any());

    const BaseLogEntrySchema = z.object({
        ulid: z.string(),
        timestamp: z.number(),
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

export const LogEntrySchema = createLogEntrySchema();

// Verify it matches the type
isTypeEqual<z.infer<typeof LogEntrySchema>, LogEntry>(true);

export function isLogEntry(x: unknown): x is LogEntry {
    return LogEntrySchema.safeParse(x).success;
}