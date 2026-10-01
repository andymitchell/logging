// What a stored record is, and how it becomes a current `LogEntry`. Stores import from here only.

export { LOG_ENTRY_FORMAT_VERSION } from "./version.ts";
export type { LogEntryFormatVersion } from "./version.ts";
export { migrateLogEntry, isCurrentLogEntry } from "./migrateLogEntry.ts";
export { decideCleanUp } from "./decideCleanUp.ts";
export type { CleanUpDecision, LogEntryV1, MigrationOutcome } from "./types.ts";
