
import { MemoryLogStorage } from "./log-storage/memory/MemoryLogStorage.ts";
import { WebhookLogStorage } from "./log-storage/webhook/WebhookLogStorage.ts";
import { ChannelsLogStorage } from "./log-storage/channels/ChannelsLogStorage.ts";
import { ConsoleLogStorage } from "./log-storage/console/ConsoleLogStorage.ts";


export {
    MemoryLogStorage,
    WebhookLogStorage,
    ChannelsLogStorage,
    ConsoleLogStorage,
}

export {
    MemoryLogStorage as MemoryLogger, // Deprecated name
}