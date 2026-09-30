import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import { matchJavascriptObject } from "@andymitchell/objects/where-filter";
import { cloneToJsonSafeUnknown, type CloneToJsonSafeOptions } from "@andymitchell/clone-to-json-safe";
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
     *
     * It receives this channel's own copy of the entry, so changing it never affects another channel. The
     * copy is exact unless the entry holds a value `structuredClone` cannot copy (a function, a `Response`, a
     * throwing getter or Proxy, …); then it is a JSON copy in which each such value is a `redact:<Type>`
     * marker, and a `Date` beside it arrives as `'redact:Date:<iso>'`.
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
 * Each channel records its own copy of an entry, masked by its own storage's options. An entry holding a
 * value `structuredClone` cannot copy (a function or `Response` in the context) is still recorded: each such
 * value becomes a `redact:<Type>` marker, as it would in a single store. A context nested too deeply to copy
 * at all is recorded as `'redact:uncopyable'`.
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
     * Each channel is isolated: one channel's filter, transform or storage failing never stops the others. Every channel is handed the entry synchronously, then their results are awaited together.
     *
     * @param logEntry The complete log entry to be committed.
     * @returns `ok()` only if every matching channel recorded the entry and the per-call options could be
     * passed on; otherwise every failure: each channel's in channel order (a child store's own failures
     * unchanged, or the facade's description of a channel that threw), then the facade's own.
     */
    protected override async commitEntry(logEntry: LogEntry, options?: LogCallMaskingOptions): Promise<LoggingResult> {
        const shared = this.#shareOptions(options);

        const perChannel = this.channels.map((channel, index) => this.#askChannel(index, WRITE, () => this.#handOver(channel, logEntry, shared.options), isLogWriteResult));
        return resultFrom([...(await Promise.all(perChannel)).flatMap(asked => asked.failures), ...shared.failures]);
    }

    /**
     * Copy the per-call options once, for every channel to share.
     *
     * One options object is forwarded BY REFERENCE to every child. Clone-then-deep-freeze it so (a) the
     * caller's own object is never mutated, and (b) no child can poison the shared directive — e.g. push an
     * extra `preserve_unmasked_context_paths` entry that a concurrent sibling would then honor.
     *
     * @returns The frozen copy; or, when the options cannot be copied, no options and the failure saying so:
     * every channel then masks the entry as if none were given (fail closed).
     */
    #shareOptions(options?: LogCallMaskingOptions): { options?: LogCallMaskingOptions, failures: LoggingFailure[] } {
        if( !options ) return { failures: [] };
        try {
            return { options: deepFreeze(structuredClone(options)), failures: [] };
        } catch(cause) {
            return { failures: [{ ...this.toFailure('write', cause), message: 'Could not copy the per-call options, so every channel was given the entry without them.' }] };
        }
    }

    /**
     * Give one channel its own copy of the entry, if it accepts it.
     *
     * @returns The channel's answer, or {@link NOT_ACCEPTED} if its filter rejects the entry.
     */
    #handOver(channel: Channel, logEntry: LogEntry, frozenOptions?: LogCallMaskingOptions): Promise<LogWriteResult> | typeof NOT_ACCEPTED {
        // 1. Check if the channel should accept this entry
        if (channel.accept && !matchJavascriptObject<LogEntry>(logEntry, channel.accept)) return NOT_ACCEPTED;

        // 2. Give the channel its own copy, so a transform or store in one channel can't change another's.
        const entryForChannel = copyEntry(logEntry);

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

const WRITE: ChannelQuestion = { operation: 'write', threw: 'threw while filtering, transforming or handing over the entry.', answer: 'a write result' };
const READ: ChannelQuestion = { operation: 'read', threw: 'threw instead of answering the read with a result.', answer: 'a read result' };
const RESET: ChannelQuestion = { operation: 'reset', threw: 'threw while filtering or handing over the entries.', answer: 'a result' };
const CLEAR_OLD_ENTRIES: ChannelQuestion = { operation: 'clear_old_entries', threw: 'threw instead of answering with a result.', answer: 'a result' };

/**
 * A channel whose `accept` filter rejects the entry is not asked to record it.
 */
const NOT_ACCEPTED = Symbol('not accepted');

/**
 * Copy an entry for one channel, so nothing one channel's transform or store does can reach another's copy.
 *
 * `structuredClone` copies the entry exactly. When it cannot (the context holds a function, a `Response`, a
 * throwing getter or Proxy, …), each field of the entry is copied as JSON instead: each such value becomes a
 * `redact:<Type>` marker, and getters are not run. The channel's store still masks the copy as it would the
 * original, because keys survive and the markers are already safe. A field that cannot be copied even as JSON
 * (e.g. a context nested too deeply to walk) becomes {@link UNCOPYABLE}, and the other fields are kept.
 */
function copyEntry(entry: LogEntry): LogEntry {
    try {
        return structuredClone(entry);
    } catch {
        // Every field of `entry` is replaced by its own copy; spreading `entry` first only carries its type.
        return { ...entry, ...Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, copyAsJsonOrMark(value)])) };
    }
}

function copyAsJsonOrMark(value: unknown) {
    try {
        return cloneToJsonSafeUnknown(value, AS_JSON);
    } catch {
        return UNCOPYABLE;
    }
}

/** Keep a trace of each value JSON cannot hold, and drop a reference back to an ancestor. Nothing is masked. */
const AS_JSON: CloneToJsonSafeOptions = { non_serialisable_handling: 'redact', skip_circular: true };

/** What a channel records in place of a `context` or `meta` that cannot be copied at all. */
const UNCOPYABLE = 'redact:uncopyable';

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