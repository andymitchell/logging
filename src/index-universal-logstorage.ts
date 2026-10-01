
import { MemoryLogStorage } from "./log-storage/memory/MemoryLogStorage.ts";
import { WebhookLogStorage } from "./log-storage/webhook/WebhookLogStorage.ts";
import { ChannelsLogStorage } from "./log-storage/channels/ChannelsLogStorage.ts";
import { ConsoleLogStorage } from "./log-storage/console/ConsoleLogStorage.ts";
// Re-exported so consumers can EXTEND the sensitive key-name list without importing
// @andymitchell/clone-to-json-safe directly: `sensitive_context_key_names: [...BUILT_IN_SENSITIVE_KEYS, 'myOrgToken']`.
// That package stays the single source of truth for the list.
import { BUILT_IN_SENSITIVE_KEYS } from "@andymitchell/clone-to-json-safe";
// For store authors who extend `BaseLogStorage` and answer a hook (`commitEntry` etc.) with a failure.
import { createLoggingFailedResult } from "./failures/results.ts";
// For store authors: `isCurrentLogEntry` guards what `queryEntries` returns, and `migrateLogEntry` decides what
// clean-up does with each stored record. Also for anyone restoring entries from an older library before `reset`.
import { isCurrentLogEntry, LOG_ENTRY_FORMAT_VERSION, migrateLogEntry } from "./log-storage/format/index.ts";


export {
    MemoryLogStorage,
    WebhookLogStorage,
    ChannelsLogStorage,
    ConsoleLogStorage,
    BUILT_IN_SENSITIVE_KEYS,
    createLoggingFailedResult,
    isCurrentLogEntry,
    migrateLogEntry,
    LOG_ENTRY_FORMAT_VERSION,
}

export {
    MemoryLogStorage as MemoryLogger, // Deprecated name
}