import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import { matchJavascriptObject } from "@andymitchell/objects/where-filter"; 
import type { LogStorageOptions } from "../types.ts";
import { BaseLogStorage } from "../BaseLogStorage.ts";
import type { ILogStorage, LogCallMaskingOptions, LogEntry } from "../types.ts";
import type { LogReadResult, LogWriteResult, LoggingFailure, LoggingOperation, LoggingResult } from "../../failures/types.ts";
import { isLogReadResult, isLogWriteResult, isLoggingResult, resultFrom } from "../../failures/results.ts";

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
 *
 * Every call reaches every channel, even when one fails, and succeeds only if they all do. A failed result
 * lists each failing channel's failures, in channel order, alongside whatever the healthy channels produced:
 * a read returns their merged entries.
 *
 * @example
 * const r = await storage.get();
 * setRows(r.entries); // the healthy channels' entries
 * setBroken(r.error?.failures.map(f => f.source) ?? []); // e.g. ['IDBLogStorage:my-app']
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

        const perChannel = this.channels.map((channel, index) => this.#askChannel(index, WRITE, () => this.#handOver(channel, logEntry, frozenOptions), isLogWriteResult));
        return resultFrom((await Promise.all(perChannel)).flatMap(asked => asked.failures));
    }

    /**
     * Give one channel its own copy of the entry, if it accepts it.
     *
     * @returns The channel's answer, or {@link NOT_ACCEPTED} if its filter rejects the entry.
     */
    #handOver(channel: Channel, logEntry: LogEntry, frozenOptions?: LogCallMaskingOptions): Promise<LogWriteResult> | typeof NOT_ACCEPTED {
        // 1. Check if the channel should accept this entry
        if (channel.accept && !matchJavascriptObject<LogEntry>(logEntry, channel.accept)) return NOT_ACCEPTED;

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
        return channel.storage.add(entryToSend, frozenOptions);
    }

    /**
     * Ask one channel something, and collect its failures.
     *
     * `ask` runs synchronously, so every channel is asked before any answer is awaited. A throw while asking,
     * a rejection, or an answer `isWellFormed` rejects becomes this facade's own failure naming the channel.
     *
     * @returns The channel's answer (absent if it failed to give one, or did not accept the entry) and its
     * failures: the answer's own, passed on unchanged, or the facade's description. Never rejects.
     */
    async #askChannel<A extends LoggingResult>(index: number, question: ChannelQuestion, ask: () => Promise<A> | typeof NOT_ACCEPTED, isWellFormed: (answer: unknown) => boolean): Promise<{ answer?: A, failures: LoggingFailure[] }> {
        let answering: Promise<A> | typeof NOT_ACCEPTED;
        try {
            answering = ask();
        } catch(cause) {
            return { failures: [this.#channelFailure(question.operation, index, cause, question.threw)] };
        }
        if (answering === NOT_ACCEPTED) return { failures: [] };

        try {
            const answer = await answering;
            if (!isWellFormed(answer)) return { failures: [this.#channelFailure(question.operation, index, answer, `answered with something that is not ${question.answer}.`)] };
            return { answer, failures: answer.error?.failures ?? [] };
        } catch(cause) {
            return { failures: [this.#channelFailure(question.operation, index, cause, 'rejected instead of answering with a result.')] };
        }
    }

    #channelFailure(operation: LoggingOperation, index: number, cause: unknown, what: string): LoggingFailure {
        return { ...this.toFailure(operation, cause), message: `channels[${index}] ${what}` };
    }

    /**
     * Ask every channel for its entries, and merge them.
     *
     * Every channel is asked, even when another fails. The result is `ok` only if every channel answered in
     * full; otherwise it lists every failure, in channel order, alongside the entries the healthy channels
     * returned.
     *
     * @param filter A filter to apply to the query in each channel.
     * @param fullTextFilter A full-text search string to apply.
     * @returns The channels' entries, de-duplicated by ULID and sorted oldest first.
     */
    protected override async queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
        const perChannel = this.channels.map((channel, index) => this.#askChannel(index, READ, () => channel.storage.get(filter, fullTextFilter), isLogReadResult));
        const asked = await Promise.all(perChannel);

        // De-duplicate using the ULID, which is unique per entry
        const uniqueEntriesMap = new Map<string, T>();
        for (const entry of asked.flatMap(({ answer }) => answer?.entries ?? [])) {
            uniqueEntriesMap.set(entry.ulid, entry);
        }

        const uniqueEntries = Array.from(uniqueEntriesMap.values());

        // Sort by ULID to ensure chronological order across all sources
        uniqueEntries.sort((a, b) => a.ulid.localeCompare(b.ulid));

        return { ...resultFrom(asked.flatMap(({ failures }) => failures)), entries: uniqueEntries };
    }


    /**
     * Clear old entries from every channel, each by its own `max_age`.
     *
     * @returns `ok()` only if every channel cleared; otherwise every failure, in channel order.
     */
    protected override async clearOldEntries(): Promise<LoggingResult> {
        const perChannel = this.channels.map((channel, index) => this.#askChannel(index, CLEAR_OLD_ENTRIES, () => channel.storage.forceClearOldEntries(), isLoggingResult));
        return resultFrom((await Promise.all(perChannel)).flatMap(({ failures }) => failures));
    }

    /**
     * Reset every channel. Each channel is given only the `entries` its `accept` filter matches.
     *
     * @returns `ok()` only if every channel reset; otherwise every failure, in channel order.
     */
    protected override async resetEntries(entries?: LogEntry[]): Promise<LoggingResult> {
        const perChannel = this.channels.map((channel, index) => this.#askChannel(index, RESET, () => {
            const channelEntries = entries? entries.filter(x => !channel.accept || matchJavascriptObject<LogEntry>(x, channel.accept)) : undefined;
            return channel.storage.reset(channelEntries);
        }, isLoggingResult));
        return resultFrom((await Promise.all(perChannel)).flatMap(({ failures }) => failures));
    }
}


/**
 * What {@link ChannelsLogStorage} asks a channel, as named in the failure when the channel does not answer.
 */
type ChannelQuestion = {
    operation: LoggingOperation,
    /** Completes "channels[i] …" when asking threw. */
    threw: string,
    /** Completes "channels[i] answered with something that is not …". */
    answer: string,
};

const WRITE: ChannelQuestion = { operation: 'write', threw: 'threw while filtering, cloning, transforming or handing over the entry.', answer: 'a write result' };
const READ: ChannelQuestion = { operation: 'read', threw: 'threw instead of answering the read with a result.', answer: 'a read result' };
const RESET: ChannelQuestion = { operation: 'reset', threw: 'threw while filtering or handing over the entries.', answer: 'a result' };
const CLEAR_OLD_ENTRIES: ChannelQuestion = { operation: 'clear_old_entries', threw: 'threw instead of answering with a result.', answer: 'a result' };

/**
 * A channel whose `accept` filter rejects the entry is not asked to record it.
 */
const NOT_ACCEPTED = Symbol('not accepted');

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