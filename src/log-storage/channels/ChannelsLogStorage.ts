import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import { matchJavascriptObject } from "@andymitchell/objects/where-filter"; 
import type { LogStorageOptions } from "../types.ts";
import { BaseLogStorage } from "../BaseLogStorage.ts";
import type { ILogStorage, LogCallMaskingOptions, LogEntry } from "../types.ts";
import type { LoggingFailure, LoggingResult } from "../../failures/types.ts";
import { isLogWriteResult, resultFrom } from "../../failures/results.ts";

/**
 * Defines the configuration for a single channel within the ChannelsLogStorage.
 */
export interface Channel {
    /**
     * The underlying storage instance (e.g., MemoryLogStorage, IDBLogStorage) for this channel.
     */
    storage: ILogStorage;

    /**
     * An optional filter. If provided, only log entries that match this filter
     * will be sent to this channel's storage. If omitted, all entries are accepted.
     */
    accept?: WhereFilterDefinition<LogEntry>;

    /**
     * An optional function to modify a log entry before it's sent to this channel's
     * storage. Useful for redacting data, adding channel-specific metadata, etc.
     */
    transform?: (entry: LogEntry) => LogEntry;
}

// The fan-out sink must not carry sensitive-data masking CONFIG of its own: it forwards entries untouched to
// its sub-storages (see prepareContext override), so any unmasking — standing config OR the per-call gate — is
// decided there, per-sub-storage, intentionally. (Per-call DIRECTIVES still propagate through, via commitEntry;
// it's only the facade's own masking config that would be meaningless here.)
type LogStorageOptionsWithoutSensitive = Omit<LogStorageOptions, 'permit_dangerous_context_properties' | 'redact_sensitive_context_keys' | 'sensitive_context_key_names' | 'preserve_unmasked_context_paths' | 'allow_per_call_unmasking'>;

/**
 * A facade LogStorage that distributes log entries to multiple "channels" based on a set of rules.
 * 
 * Each channel consists of an underlying ILogStorage (the storage) and optional rules for accepting
 * and transforming entries. This allows for complex logging strategies, such as:
 * - Sending only errors to a Webhook logger.
 * - Sending all logs to an in-memory logger for quick access.
 * - Redacting sensitive information before sending logs to a persistent IndexedDB store.
 */
export class ChannelsLogStorage extends BaseLogStorage implements ILogStorage {

    private channels: Channel[];

    protected override readonly storeName: string = 'ChannelsLogStorage';

    /**
     * @param dbNamespace A namespace for this logger instance.
     * @param channels An array of channel configurations.
     * @param options Standard logger options.
     */
    constructor(dbNamespace: string, channels: Channel[], options?: LogStorageOptionsWithoutSensitive) {
        super(dbNamespace, options);
        if (!channels || channels.length === 0) {
            throw new Error("ChannelsLogStorage requires at least one channel in its configuration.");
        }
        this.channels = channels;
    }

    /**
     * Pure passthrough: forward the raw context unchanged so each sub-storage masks ONCE, with its own config
     * and gate (avoids double-stripping). Per-call options are forwarded separately in {@link commitEntry}, not
     * consumed here.
     * @param context
     * @returns the context, untouched.
     */
    protected override prepareContext(context?: any, _options?: LogCallMaskingOptions) {
        return context;
    }

    /**
     * Distributes the finalized log entry to all matching channels.
     * This method is called internally by the `add` method in `BaseLogStorage`.
     *
     * Each channel is isolated: one channel's filter, clone, transform or storage failing never stops the
     * others. Every channel is handed the entry synchronously, then their results are awaited together.
     *
     * @param logEntry The complete log entry to be committed.
     * @returns `ok()` only if every matching channel recorded the entry; otherwise every failure, in channel
     * order: a child store's own failures unchanged, or the facade's description of a channel that threw.
     */
    protected override async commitEntry(logEntry: LogEntry, options?: LogCallMaskingOptions): Promise<LoggingResult> {
        // One options object is forwarded BY REFERENCE to every child. Clone-then-deep-freeze it so (a) the
        // caller's own object is never mutated, and (b) no child can poison the shared directive — e.g. push an
        // extra `preserve_unmasked_context_paths` entry that a concurrent sibling would then honor.
        const frozenOptions = options ? deepFreeze(structuredClone(options)) : undefined;

        const perChannel = this.channels.map((channel, index) => this.#sendToChannel(channel, index, logEntry, frozenOptions));
        return resultFrom((await Promise.all(perChannel)).flat());
    }

    /**
     * Send the entry to one channel, if it accepts it.
     *
     * @returns The channel's failures: none if it recorded the entry (or does not accept it). Never rejects.
     */
    async #sendToChannel(channel: Channel, index: number, logEntry: LogEntry, frozenOptions?: LogCallMaskingOptions): Promise<LoggingFailure[]> {
        let answer: Promise<unknown>;
        try {
            // 1. Check if the channel should accept this entry
            if (channel.accept && !matchJavascriptObject<LogEntry>(logEntry, channel.accept)) return [];

            // 2. Clone the entry to prevent transforms in one channel affecting another.
            // The `structuredClone` is important for isolation.
            const entryForChannel = structuredClone(logEntry);

            // 3. Transform the entry if a transformer is provided. Per-call options are deliberately NOT
            // passed to `transform`: they are a masking directive, not entry data, and must never be
            // attached to the entry (which would persist them).
            const entryToSend:LogEntry = channel.transform ? channel.transform(entryForChannel) : entryForChannel;

            // 4. Send to the channel's storage, forwarding the frozen per-call options so a flagged child
            // (allow_per_call_unmasking) can honor them. We call .add() to adhere to the ILogStorage
            // interface. The underlying BaseLogStorage.add() will use the existing ulid.
            answer = channel.storage.add(entryToSend, frozenOptions);
        } catch(cause) {
            return [this.#channelFailure(index, cause, 'threw while filtering, cloning, transforming or handing over the entry.')];
        }

        try {
            const result = await answer;
            if (!isLogWriteResult(result)) return [this.#channelFailure(index, result, 'answered with something that is not a write result.')];
            return result.error?.failures ?? [];
        } catch(cause) {
            return [this.#channelFailure(index, cause, 'rejected instead of answering with a result.')];
        }
    }

    #channelFailure(index: number, cause: unknown, what: string): LoggingFailure {
        return { ...this.toFailure('write', cause), message: `channels[${index}] ${what}` };
    }

    /**
     * Retrieves log entries from all configured channels, merges them,
     * de-duplicates them, and returns a sorted list.
     * @param filter A filter to apply to the query in each channel.
     * @param fullTextFilter A full-text search string to apply.
     * @returns A unified, sorted array of log entries.
     */
    public override async get<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<T[]> {
        const getPromises = this.channels.map(channel => 
            channel.storage.get(filter, fullTextFilter)
        );

        const resultsFromAllChannels = await Promise.all(getPromises);
        const allEntries = resultsFromAllChannels.flat();

        // De-duplicate using the ULID, which is unique per entry
        const uniqueEntriesMap = new Map<string, T>();
        for (const entry of allEntries) {
            uniqueEntriesMap.set(entry.ulid, entry);
        }

        const uniqueEntries = Array.from(uniqueEntriesMap.values());

        // Sort by ULID to ensure chronological order across all sources
        uniqueEntries.sort((a, b) => a.ulid.localeCompare(b.ulid));

        return uniqueEntries;
    }


    /**
     * Clears old entries from all configured channels.
     */
    public override async forceClearOldEntries(): Promise<void> {
        const clearPromises = this.channels.map(channel => channel.storage.forceClearOldEntries());
        await Promise.all(clearPromises);
    }
    
    /**
     * Resets all configured channels.
     * @param entries - **WARNING:** Providing entries is not supported and will throw an error,
     * as it's ambiguous which channel should receive the data. To populate a specific
     * channel, call `.reset(entries)` directly on its storage instance.
     */
    public override async reset(entries?: LogEntry[]): Promise<void> {

        const resetPromises: Promise<void>[] = [];
        for (const channel of this.channels) {
            
            const channelEntries = entries? entries.filter(x => !channel.accept || matchJavascriptObject<LogEntry>(x, channel.accept)) : undefined;
            
            resetPromises.push(channel.storage.reset(channelEntries));
        }

        await Promise.all(resetPromises);
    }
}

/**
 * Recursively freeze a value so a forwarded options object — shared by reference across all children — cannot
 * be mutated by any one child (e.g. pushing an extra path entry a concurrent sibling would then honor). Freezes
 * before recursing so a cyclic reference cannot loop.
 */
function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Reflect.ownKeys(value)) {
            deepFreeze((value as Record<PropertyKey, unknown>)[key]);
        }
    }
    return value;
}