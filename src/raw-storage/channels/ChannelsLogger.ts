import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import { matchJavascriptObject } from "@andyrmitchell/objects/where-filter"; 
import type { LoggerOptions } from "../../types.ts";
import { BaseLogger } from "../BaseLogger.ts";
import type { IRawLogger, LogEntry } from "../types.ts";

/**
 * Defines the configuration for a single channel within the ChannelsLogger.
 */
export interface Channel {
    /**
     * The underlying storage instance (e.g., MemoryRawLogger, IDBRawLogger) for this channel.
     */
    storage: IRawLogger;

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

type LoggerOptionsWithoutSensitive = Omit<LoggerOptions, 'permit_dangerous_context_properties'>;

/**
 * A facade RawLogger that distributes log entries to multiple "channels" based on a set of rules.
 * 
 * Each channel consists of an underlying IRawLogger (the storage) and optional rules for accepting
 * and transforming entries. This allows for complex logging strategies, such as:
 * - Sending only errors to a Webhook logger.
 * - Sending all logs to an in-memory logger for quick access.
 * - Redacting sensitive information before sending logs to a persistent IndexedDB store.
 */
export class ChannelsLogger extends BaseLogger implements IRawLogger {

    private channels: Channel[];

    /**
     * @param dbNamespace A namespace for this logger instance.
     * @param channels An array of channel configurations.
     * @param options Standard logger options.
     */
    constructor(dbNamespace: string, channels: Channel[], options?: LoggerOptionsWithoutSensitive) {
        super(dbNamespace, options);
        if (!channels || channels.length === 0) {
            throw new Error("ChannelsLogger requires at least one channel in its configuration.");
        }
        this.channels = channels;
    }

    /**
     * Do nothing - let the sub storage we pass it to handle it. 
     * We want to pass objects intact so they don't double strip sensitive info.
     * @param context 
     * @returns 
     */
    protected override prepareContext(context?: any) {
        return context; 
    }

    /**
     * Distributes the finalized log entry to all matching channels.
     * This method is called internally by the `add` method in `BaseLogger`.
     * @param logEntry The complete log entry to be committed.
     */
    protected override async commitEntry(logEntry: LogEntry): Promise<void> {
        const commitPromises: Promise<unknown>[] = [];

        for (const channel of this.channels) {
            // 1. Check if the channel should accept this entry
            const isMatch = !channel.accept || matchJavascriptObject(logEntry, channel.accept);

            if (isMatch) {
                // 2. Clone the entry to prevent transforms in one channel affecting another.
                // The `structuredClone` is important for isolation.
                const entryForChannel = structuredClone(logEntry);

                // 3. Transform the entry if a transformer is provided
                const entryToSend:LogEntry = channel.transform ? channel.transform(entryForChannel) : entryForChannel;

                // 4. Send to the channel's storage. We call .add() to adhere to the IRawLogger interface.
                // The underlying BaseLogger.add() will use the existing ulid.
                commitPromises.push(channel.storage.add(entryToSend));
            }
        }

        // Wait for all channels to complete their write operations
        await Promise.all(commitPromises);
    }

    /**
     * Retrieves log entries from all configured channels, merges them,
     * de-duplicates them, and returns a sorted list.
     * @param filter A filter to apply to the query in each channel.
     * @param fullTextFilter A full-text search string to apply.
     * @returns A unified, sorted array of log entries.
     */
    public override async get(filter?: WhereFilterDefinition<LogEntry>, fullTextFilter?: string): Promise<LogEntry[]> {
        const getPromises = this.channels.map(channel => 
            channel.storage.get(filter, fullTextFilter)
        );

        const resultsFromAllChannels = await Promise.all(getPromises);
        const allEntries = resultsFromAllChannels.flat();

        // De-duplicate using the ULID, which is unique per entry
        const uniqueEntriesMap = new Map<string, LogEntry>();
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
            
            const channelEntries = entries? entries.filter(x => !channel.accept || matchJavascriptObject(x, channel.accept)) : undefined;
            
            resetPromises.push(channel.storage.reset(channelEntries));
        }

        await Promise.all(resetPromises);
    }
}