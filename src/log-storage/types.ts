import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { PreserveUnmaskedPath } from "@andymitchell/clone-to-json-safe";
import type { IBreakpoints } from "../breakpoints/types.ts";
import type { MaxAge, MinimumContext } from "../types.ts";
import type { LogReadResult, LogWriteResult, LoggingError, LoggingFailureListener, LoggingResult } from "../failures/types.ts";
import type { LogEntryFormatVersion } from "./format/version.ts";


/**
 * Test if the variable is a LogEntry. 
 * 
 * It's not an exhaustive zod-schema driven test, because trying to avoid requiring zod for this. 
 * @param x 
 */
export function isLogEntrySimple(x: unknown):x is LogEntry {
    return typeof x==='object' && x!==null && "ulid" in x && "type" in x;
}

export type BaseLogEntry<C = any, M = any> = {
    
    /**
     * The Universally Unique Lexicographically Sortable Identifier. 
     * 
     * An id that if sorted, will be in time order (and is extremely unlikely to collide even on the same millisecond, even in distributed systems). 
     */
    ulid: string,

    /**
     * Entry timestamp.
     * 
     * You can discard this to save space, and instead use decodeTime from the 'ulid' package, on the .ulid property.
     */
    timestamp: number,

    /**
     * The envelope format of this entry. Stamped by the store when the entry is recorded; a caller cannot set it.
     *
     * A store only ever returns entries of the current format, migrating or discarding older ones when it
     * cleans up.
     */
    format_version: LogEntryFormatVersion,

    /**
     * Externally passed-in context (e.g. a parameter when the .log function is called)
     */
    context?: C, //DeepSerializable<any>,

    /**
     * Internal data used by the logging system (a span's ids, for example). Not masked. Any shape: narrow it
     * before use.
     */
    meta?: M,
    
    stack_trace?: string
}
type DebugLogEntry<C = any, M = any> = BaseLogEntry<C, M> & {
    type: 'debug',
    message: string
};
type InfoLogEntry<C = any, M = any> = BaseLogEntry<C, M> & {
    type: 'info',
    message: string
};
type WarnLogEntry<C = any, M = any> = BaseLogEntry<C, M> & {
    type: 'warn',
    message: string
};
type ErrorLogEntry<C = any, M = any> = BaseLogEntry<C, M> & {
    type: 'error',
    message: string
};
type CriticalLogEntry<C = any, M = any> = BaseLogEntry<C, M> & {
    type: 'critical',
    message: string
};

type BaseEventDetail = {
    name: string
}
export type StartEventDetail = BaseEventDetail & {
    name: 'span_start'
}
type EndEventDetail = BaseEventDetail & {
    name: 'span_end'
}
export type EventDetail = StartEventDetail | EndEventDetail;

export type EventLogEntry<C = any, M = any, E extends EventDetail = EventDetail> = BaseLogEntry<C, M> & {
    type: 'event',
    message?: string
    event: E
};

/**
 * Test if the variable is an event entry (`type: 'event'`), such as the markers written when a span starts or ends.
 *
 * Event entries carry structural information about a trace rather than a message, so viewers usually
 * handle them separately from debug/info/warn/error/critical entries.
 *
 * @param x Any value, typically an item from a list of log entries.
 * @returns `true` if `x` is an object whose `type` is `'event'`.
 *
 * @example
 * const events = entries.filter(isEventLogEntry);
 * events.forEach(e => console.log(e.event.name)); // 'span_start' | 'span_end'
 *
 * @remarks
 * Only the `type` discriminator is checked, not the full shape.
 */
export function isEventLogEntry(x: unknown): x is EventLogEntry {
    return (typeof x==='object') && !!x && "type" in x && x.type==='event';
}

/**
 * Union of all possible entry types
 */
export type LogEntry<C = any, M = any> = 
    DebugLogEntry<C, M> |
    InfoLogEntry<C, M> | 
    WarnLogEntry<C, M> | 
    ErrorLogEntry<C, M> |
    CriticalLogEntry<C, M> | 
    EventLogEntry<C, M>



/**
 * Like LogEntry, but context can be anything (not yet serialised down).
 *
 * The store sets `timestamp` and `format_version` when it records the entry, so neither can be passed; `ulid`
 * is optional and minted when absent.
 */
export type AcceptLogEntry<C = any, M = any> =
  | (Omit<DebugLogEntry<C, M>, 'timestamp' | 'ulid' | 'format_version'> & { ulid?: string })
  | (Omit<InfoLogEntry<C, M>, 'timestamp' | 'ulid' | 'format_version'> & { ulid?: string })
  | (Omit<WarnLogEntry<C, M>, 'timestamp' | 'ulid' | 'format_version'> & { ulid?: string })
  | (Omit<ErrorLogEntry<C, M>, 'timestamp' | 'ulid' | 'format_version'> & { ulid?: string })
  | (Omit<CriticalLogEntry<C, M>, 'timestamp' | 'ulid' | 'format_version'> & { ulid?: string })
  | (Omit<EventLogEntry<C, M>, 'timestamp' | 'ulid' | 'format_version'> & { ulid?: string });




export type LogEntryType = LogEntry['type'];


/**
 * Per-call ("per-log") masking directives, supplied at a single call site via a `*WithOptions` method
 * (e.g. {@link ILogger.logWithOptions}) and carried **out-of-band** — never written onto the entry, so
 * never persisted and untouched by `structuredClone`.
 *
 * Why a dedicated options type rather than just more context: it lets one log say "this specific value is
 * safe to keep unmasked here" without weakening the storage's standing config. It is honored **only** by a
 * storage built with `allow_per_call_unmasking: true` (see {@link LogStorageOptions.allow_per_call_unmasking});
 * every other sink ignores it. It deliberately CANNOT carry `permit_dangerous_context_properties`: per-call
 * must never reach the value-agnostic `_dangerous` escape hatch — its only power is the fail-closed
 * path+shape allowlist.
 *
 * @typeParam C - The logged context shape. `preserve_unmasked_context_paths` is narrowed to the real scalar
 * dot-paths of `C` (arrays-of-objects spread to their elements, e.g. `orders.items.ref`), so a typo or a
 * renamed field is a COMPILE error. Untyped callers (no `C`) get `path: string`, unchanged.
 * @example
 * logger.logWithOptions({ preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] }, 'hi', { user: { id } });
 */
export type LogCallMaskingOptions<C extends MinimumContext = MinimumContext> = {
    /**
     * Keep specific context values UNMASKED for THIS log only, gated by BOTH dot-path AND value-shape
     * (fail-closed) — exactly like {@link LogStorageOptions.preserve_unmasked_context_paths} but scoped to
     * the single call. Paths are relative to the context object root (`user.id`, not `context.user.id`) and
     * are narrowed to `C`'s real scalar paths (incl. array spreads); see {@link PreserveUnmaskedPath}.
     */
    preserve_unmasked_context_paths?: PreserveUnmaskedPath<C>[];
};

/**
 * The storage area for loggers. An implementation of this will always be passed into a Logger/Trace class.
 *
 * Logging never breaks the control flow of the code that logs: no method throws or rejects. A call that
 * fails resolves a result saying so (`{ ok: false, error }`), and the same error is told to the store's
 * {@link ILogStorage.onFailure} listeners. Every failure is plain JSON, written by the store where it
 * happened, and never quotes logged data. Extend `BaseLogStorage` to get these guarantees for free.
 *
 * A store only ever holds, and only ever returns, valid entries in the current format (see
 * `LOG_ENTRY_FORMAT_VERSION`). `add` and `reset` refuse anything else with a failed result; `get` skips any
 * record on the store's substrate it cannot read (written by an older or newer library, or by another script);
 * clean-up upgrades entries from older formats and removes records it cannot read. Reading never changes what
 * is stored.
 */
export interface ILogStorage {

    breakpoints?: IBreakpoints | null,

    /**
     * Add an entry to the data store.
     *
     * @param entry
     * @param options Optional per-call masking directives (out-of-band; honored only when this storage has
     * `allow_per_call_unmasking: true`). Non-generic on purpose — typed paths live at the `*WithOptions`
     * call sites; `C` cannot be reliably inferred from the entry's union here.
     * @returns `{ ok: true, entry }` with the recorded entry, or `{ ok: false, entry, error }`; `entry` is
     * present on failure whenever it was built. Its context is always masked: a Channels facade, whose
     * channels each record the entry masked by their own options, returns it masked with the default options.
     * Never rejects. Resolving means the store committed the entry or failed to.
     *
     * @remarks
     * The store stamps `ulid`, `timestamp` and `format_version`. An entry that is not a valid log entry once
     * masked and stamped (a non-string `message` or an unknown `type`, passed from JavaScript or through a
     * cast) is never recorded: the call fails with `{ ok: false, error }` and no `entry`, and the error does
     * not quote the entry.
     */
    add<T extends any>(entry:AcceptLogEntry<T>, options?: LogCallMaskingOptions):Promise<LogWriteResult<T>>;

    /**
     * Retrieve entries from the data store, oldest first.
     *
     * @param filter Match any entries with a precise spec
     * @param fullTextFilter Match entries that, when serialised, contain this text
     * @returns `{ ok: true, entries }`, or `{ ok: false, entries, error }`. `entries` is always an array: on
     * failure it holds whatever the store could still read (e.g. a `ChannelsLogStorage`'s healthy children),
     * often none. Never rejects.
     *
     * @example
     * const r = await storage.get({ type: 'error' });
     * setRows(r.entries);
     * setBroken(r.error?.failures.map(f => f.source) ?? []);
     *
     * @remarks
     * Every entry is valid and in the current format. A record the store cannot read is skipped, not
     * reported: the read is still `ok`. A read never changes or removes anything stored.
     *
     * A store that keeps no entries (console, webhook) answers `{ ok: true, entries: [] }`.
     */
    get<T extends LogEntry = LogEntry>(filter?:WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>>;

    /**
     * Clean up: upgrade entries from older formats, remove records the store cannot read, and remove entries
     * older than `max_age` (see {@link LogStorageOptions}).
     *
     * Records written by a newer version of the library are left untouched, whatever their age. A store
     * whose substrate outlives it (IndexedDB) also cleans up as it opens, before it answers any call.
     *
     * @returns `{ ok: true }`, or `{ ok: false, error }`. Never rejects.
     */
    forceClearOldEntries(): Promise<LoggingResult>;


    /**
     * Manually reset the database and populate it with the passed in entries.
     *
     * @param entries The entries the store holds afterwards; none if omitted. Each must be a valid entry in the
     * current format: upgrade entries saved by an older version of the library with `migrateLogEntry` first.
     * @returns `{ ok: true }`, or `{ ok: false, error }`. Never rejects. If `entries` is not an array, or any
     * entry is not a valid current entry, the whole call fails and the store is unchanged.
     */
    reset(entries?:LogEntry[]): Promise<LoggingResult>;

    /**
     * Be told whenever a logging call on this store fails.
     *
     * This is the store's one "my logging is failing" hook: subscribe once at startup, on the store you gave
     * your logger, and forward the error to a channel that is not this store (e.g. your error reporter).
     * The listener receives the same {@link LoggingError} the failed call returns, once per failed call.
     *
     * @param listener - Told the error of every failed call from now on. It may be asynchronous; a listener
     * that throws or rejects is ignored, and the other listeners still run.
     * @returns A function that removes the listener.
     *
     * @example
     * const stop = storage.onFailure(error => reportToSentry(error)); // error is plain JSON
     *
     * @remarks
     * - Subscribing the same function twice has no effect.
     * - Nothing is buffered: a listener subscribed after a failure does not hear it.
     * - A logging call made from inside a listener does not deliver its own failure, so a listener that logs
     *   into the failing store cannot loop forever. An async listener that logs after an `await` is outside
     *   that protection; report through a different channel instead.
     * - A failure passes up through every store it touches: a `ChannelsLogStorage` reports its children's
     *   failures as its own, so listening on both a child and its facade hears the failure twice.
     */
    onFailure(listener: LoggingFailureListener): () => void;

    /**
     * Tell this store's failure listeners about a failure that happened outside the store.
     *
     * Loggers and spans call this when the store itself could not answer (e.g. it threw), so the app hears
     * about it through {@link ILogStorage.onFailure} like any other failure. Applications do not normally
     * call it.
     *
     * @param error - The error being returned to the caller of the failed logging call.
     *
     * @remarks
     * Must not throw. Called from inside a failure listener, it delivers nothing.
     */
    reportInternalFailure(error: LoggingError): void;

}

export interface LogStorageOptions {
    include_stack_trace?: {
        debug: boolean;
        info: boolean;
        warn: boolean;
        error: boolean;
        critical: boolean;
        event: boolean;
    };
    log_to_console?:boolean,

    /**
     * Cull logs based on age, when the store cleans up. Set different times for different filters (matching first found in array)
     *
     * Records written by a newer version of the library are never culled: this version cannot read them.
     *
     * @example [{filter: {type: 'error'}, max_ms: dayMs*30}, {max_ms: dayMs*5}] 
     */
    max_age?: MaxAge,


    /**
     * Allow context properties that are prefixed with '_dangerous' to not be stripped of sensitive data. Useful to allow some tracking IDs through.
     */
    permit_dangerous_context_properties?: boolean,

    /**
     * Redact a context value purely because its KEY names a secret — `password`, `apiKey`, `secret`, `ssn`, …
     * — regardless of the value's shape or strength. The key-name counterpart to the value-shape masker: it
     * catches a weak secret (`{ password: 'Password1' }`) that no shape rule would flag. The matched value —
     * and any subtree beneath a sensitive key — is replaced with a `redact:sensitive-key` marker WITHOUT being
     * read, so a getter under a sensitive key never runs and nested field names never leak.
     *
     * Matched WHOLE-TOKEN and case-insensitively: `dbPassword`, `password_hash` and `x-api-key` match; a benign
     * `passwordless` or a bare `key` do not. Set `false` to disable key-name redaction while keeping value-shape
     * masking. Like {@link permit_dangerous_context_properties} this is masking **config**, so the
     * {@link ChannelsLogStorage} facade does not take it: each child storage applies its own, and what the
     * facade shows itself is masked with the default.
     *
     * @default true
     */
    redact_sensitive_context_keys?: boolean,

    /**
     * The key-names treated as sensitive by {@link redact_sensitive_context_keys}. When set, this REPLACES the
     * conservative built-in list; omit it to use the built-ins. To EXTEND rather than replace, spread the
     * re-exported built-ins: `sensitive_context_key_names: [...BUILT_IN_SENSITIVE_KEYS, 'myOrgToken']`.
     *
     * Matched whole-token and case-insensitively against a key tokenized on camelCase / acronym / snake / kebab
     * boundaries, so one entry covers every spelling (`password` catches `dbPassword` and `password_hash`).
     *
     * @default the built-in conservative list — password, passwd, passphrase, pwd, secret, apiKey, accessToken,
     * refreshToken, privateKey, clientSecret, credential, credentials, authorization, ssn, cvv, otp
     */
    sensitive_context_key_names?: readonly string[],

    /**
     * Keep specific context values UNMASKED, gated by BOTH their dot-path AND their value-shape — e.g.
     * preserve a UUID at `user.id` or a ULID at `trace.id` so identifiers stay correlatable, while
     * everything else is still scrubbed. Paths are relative to the **context object root** (`user.id`,
     * not `context.user.id`). A value is preserved only where its path matches AND it is a whole-value
     * match for the declared shape; a non-matching value at that same path is still masked.
     *
     * Why path AND shape, never "allow any value at a path": a field's contents drift (a `user.id` that
     * holds a UUID today may hold an email after a refactor), so a path-only exemption would be silently
     * left wide open on the wrong type. Pairing with a shape is fail-closed. Like
     * {@link permit_dangerous_context_properties}, this is masking **config**: the {@link ChannelsLogStorage}
     * facade omits it from its options type, while each child storage still applies its own. The facade hands
     * its children the context unmasked, and masks what it shows itself with the default config, which keeps
     * no value readable.
     *
     * @default [] (no exemptions)
     * @example
     * { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }, { path: 'trace.id', shape: 'ulid' }] }
     */
    preserve_unmasked_context_paths?: PreserveUnmaskedPath[],

    /**
     * Opt in to honoring **per-call** masking directives ({@link LogCallMaskingOptions}) passed at the log
     * call site (e.g. via `logWithOptions`). When `false` (default), per-call directives reaching this
     * storage are ignored entirely and context is masked as if none were supplied — so a dynamic call-site
     * directive can only unmask into a sink whose owner explicitly blessed it.
     *
     * Gates **only** per-call directives; the storage-level {@link LogStorageOptions.preserve_unmasked_context_paths}
     * is unaffected. Asymmetric on purpose: per-call directives fan out through {@link ChannelsLogStorage} to
     * every child (incl. remote sinks), so each sink must opt in to trusting them; static local config does not.
     *
     * @default false
     */
    allow_per_call_unmasking?: boolean,

    /**
     * Set a custom IBreakpoints implementation (e.g. a different storage area). Defaults to in-memory if not provided.
     */
    breakpoints?: IBreakpoints | null
}