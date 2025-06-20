
import { MemoryLogStorage } from "./log-storage/memory/MemoryLogStorage.ts";
import { WebhookLogStorage } from "./log-storage/webhook/WebhookLogStorage.ts";
import { ChannelsLogStorage } from "./log-storage/channels/ChannelsLogStorage.ts";


export {
    MemoryLogStorage,
    WebhookLogStorage,
    ChannelsLogStorage
}

export {
    MemoryLogStorage as MemoryLogger, // Deprecated name
}