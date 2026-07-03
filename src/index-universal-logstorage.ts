
import { MemoryLogStorage } from "./log-storage/memory/MemoryLogStorage.ts";
import { WebhookLogStorage } from "./log-storage/webhook/WebhookLogStorage.ts";
import { ChannelsLogStorage } from "./log-storage/channels/ChannelsLogStorage.ts";
import { ConsoleLogStorage } from "./log-storage/console/ConsoleLogStorage.ts";
// Re-exported so consumers can EXTEND the sensitive key-name list without importing
// @andymitchell/clone-to-json-safe directly: `sensitive_context_key_names: [...BUILT_IN_SENSITIVE_KEYS, 'myOrgToken']`.
// That package stays the single source of truth for the list.
import { BUILT_IN_SENSITIVE_KEYS } from "@andymitchell/clone-to-json-safe";


export {
    MemoryLogStorage,
    WebhookLogStorage,
    ChannelsLogStorage,
    ConsoleLogStorage,
    BUILT_IN_SENSITIVE_KEYS,
}

export {
    MemoryLogStorage as MemoryLogger, // Deprecated name
}