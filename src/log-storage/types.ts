import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { PreserveUnmaskedPath } from "@andymitchell/clone-to-json-safe";
import type { IBreakpoints } from "../breakpoints/types.ts";
import type { MaxAge, MinimumContext } from "../types.ts";


/**
 * Test if the variable is a LogEntry. 
 * 
 * It's not an exhaustive zod-schema driven test, because trying to avoid requiring zod for this. 
 * @param x 
 */
export function isLogEntrySimple(x: unknown):x is LogEntry {
    return typeof x==='object' && x!==null && "ulid" in x && "type" in x;
}

export type BaseLogEntry<C = any, M extends MinimumContext = any> = {
    
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
     * Externally passed-in context (e.g. a parameter when the .log function is called)
     */
    context?: C, //DeepSerializable<any>,

    /**
     * Internal data used by the logging system. Does not get security-reduced. Use for things like Span ID.
     */
    meta?: M,
    
    stack_trace?: string
}
type DebugLogEntry<C = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'debug',
    message: string
};
type InfoLogEntry<C = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'info',
    message: string
};
type WarnLogEntry<C = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'warn',
    message: string
};
type ErrorLogEntry<C = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
    type: 'error',
    message: string
};
type CriticalLogEntry<C = any, M extends MinimumContext = any> = BaseLogEntry<C, M> & {
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

export type EventLogEntry<C = any, M extends MinimumContext = any, E extends EventDetail = EventDetail> = BaseLogEntry<C, M> & {
    type: 'event',
    message?: string
    event: E
};

export function isEventLogEntry(x: unknown): x is EventLogEntry {
    return (typeof x==='object') && !!x && "type" in x && x.type==='event';
}

/**
 * Union of all possible entry types
 */
export type LogEntry<C = any, M extends MinimumContext = any> = 
    DebugLogEntry<C, M> |
    InfoLogEntry<C, M> | 
    WarnLogEntry<C, M> | 
    ErrorLogEntry<C, M> |
    CriticalLogEntry<C, M> | 
    EventLogEntry<C, M>



/**
 * Like LogEntry, but context can be anything (not yet serialised down)
 */
export type AcceptLogEntry<C = any, M extends MinimumContext = any> =
  | (Omit<DebugLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<InfoLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<WarnLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<ErrorLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<CriticalLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string })
  | (Omit<EventLogEntry<C, M>, 'timestamp' | 'ulid'> & { ulid?: string });




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
 */
export interface ILogStorage {

    breakpoints?: IBreakpoints | null,

    /**
     * Add an entry to the data store
     * @param entry
     * @param options Optional per-call masking directives (out-of-band; honored only when this storage has
     * `allow_per_call_unmasking: true`). Non-generic on purpose — typed paths live at the `*WithOptions`
     * call sites; `C` cannot be reliably inferred from the entry's union here.
     */
    add<T extends any>(entry:AcceptLogEntry<T>, options?: LogCallMaskingOptions):Promise<LogEntry<T>>;

    /**
     * Retrieve entries from the data store
     * @param filter Match any entries with a precise spec
     * @param fullTextFilter Match entries that, when serialised, contain this text 
     */
    get<T extends LogEntry = LogEntry>(filter?:WhereFilterDefinition<T>, fullTextFilter?: string): Promise<T[]>;

    /**
     * Remove items older than the max age stated in LogStorageOptions
     */
    forceClearOldEntries(): Promise<void>;


    /**
     * Manually reset the database and populate it with the passed in entries 
     * @param entries 
     */
    reset(entries?:LogEntry[]): Promise<void>;

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
     * Cull logs based on age. Set different times for different filters (matching first found in array)
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
     * {@link ChannelsLogStorage} facade omits it and each child storage applies its own.
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
     * facade omits it from its options type (a pure fan-out facade never masks), while each child storage
     * still applies its own.
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