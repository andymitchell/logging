import { z } from "zod";


// Frozen: a literal copy, never built from the current schema, so a change to the current format can never
// alter what an old entry is recognised as. Never edit this file; a later format gets its own file.

const BaseLogEntryV1Schema = z.object({
    ulid: z.string(),
    timestamp: z.number().optional(),
    context: z.any().optional(),
    meta: z.any().optional(),
    stack_trace: z.string().optional(),
});

const EventDetailV1Schema = z.discriminatedUnion("name", [
    z.object({ name: z.literal("span_start") }),
    z.object({ name: z.literal("span_end") }),
]);


/**
 * A log entry as written before entries carried a `format_version` (format 1).
 *
 * Recognised by the ABSENCE of `format_version`. `timestamp` is optional because the field's contract allowed
 * discarding it in favour of the time encoded in the ulid. `context` and `meta` are whatever was logged.
 */
export const LogEntryV1Schema = z.discriminatedUnion("type", [
    BaseLogEntryV1Schema.extend({ type: z.literal("debug"), message: z.string() }),
    BaseLogEntryV1Schema.extend({ type: z.literal("info"), message: z.string() }),
    BaseLogEntryV1Schema.extend({ type: z.literal("warn"), message: z.string() }),
    BaseLogEntryV1Schema.extend({ type: z.literal("error"), message: z.string() }),
    BaseLogEntryV1Schema.extend({ type: z.literal("critical"), message: z.string() }),
    BaseLogEntryV1Schema.extend({ type: z.literal("event"), message: z.string().optional(), event: EventDetailV1Schema }),
]);
