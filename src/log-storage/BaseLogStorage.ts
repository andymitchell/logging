

import { cloneToJsonSafeUnknown, BUILT_IN_SENSITIVE_KEYS } from "@andymitchell/clone-to-json-safe";
import type {  MaxAge } from "../types.ts";
import type { AcceptLogEntry, ILogStorage, LogCallMaskingOptions, LogEntry, LogStorageOptions } from "./types.ts";
import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import { monotonicFactory } from "ulid";
import type { IBreakpoints } from "../breakpoints/types.ts";
import type { LogReadResult, LogWriteResult, LoggingError, LoggingFailed, LoggingFailure, LoggingFailureListener, LoggingOperation, LoggingResult } from "../failures/types.ts";
import { FailureListeners, isInsideFailureListener } from "../failures/FailureListeners.ts";
import { failed, isLogReadResult, isLoggingResult, resultFrom } from "../failures/results.ts";



/**
 * Use this to build specific LogStorage.
 *
 * The base does the shared work of every store (building and masking entries, stack traces, breakpoints,
 * failure listeners) and upholds the {@link ILogStorage} guarantee that no public method throws or rejects.
 * A subclass provides the hooks, which answer with a result rather than throwing:
 * - `commitEntry(entry)` → `{ ok: true }`, or `{ ok: false, error }` describing what went wrong.
 * - `queryEntries(filter, fullTextFilter)` → `{ ok: true, entries }`, or a failed result with whatever
 *   entries were obtained.
 * - `resetEntries(entries)` and `clearOldEntries()` → `{ ok: true }` or `{ ok: false, error }`.
 *
 * A hook that throws or rejects anyway is caught and described by {@link BaseLogStorage.toFailure}.
 */
export class BaseLogStorage implements ILogStorage {
    protected includeStackTrace: Required<LogStorageOptions>['include_stack_trace'];
    protected logToConsole:boolean;
    protected permitDangerousContextProperties: boolean;
    protected redactSensitiveContextKeys: Required<LogStorageOptions>['redact_sensitive_context_keys'];
    protected sensitiveContextKeyNames: Required<LogStorageOptions>['sensitive_context_key_names'];
    protected preserveUnmaskedContextPaths: Required<LogStorageOptions>['preserve_unmasked_context_paths'];
    protected allowPerCallUnmasking: boolean;
    protected maxAge: MaxAge;
    protected dbNamespace:string;

    /**
     * Generate an ID. 
     * 
     * @default monotonicFactory // guarantees ascending order within this context
     */
    protected ulid:Function;
    
    breakpoints?:IBreakpoints | null;

    /**
     * The store's name as it appears in the `source` of its failures, e.g. `IDBLogStorage`. Each store sets
     * its own, written out because a minifier may shorten the class's name.
     */
    protected readonly storeName: string = 'BaseLogStorage';

    #failureListeners = new FailureListeners();

    constructor(dbNamespace:string, options?: LogStorageOptions) {
        // Strip explicit-`undefined` keys so each falls back to its default. Callers build options
        // programmatically (`{ preserve_unmasked_context_paths: cfg.paths }` where `cfg.paths` may be
        // undefined); a raw `Object.assign` would let that `undefined` clobber the default `[]`, and a
        // later spread (`[...paths]`) / index-access (`include_stack_trace[type]`) would then throw.
        const safeOptions = Object.assign({}, DEFAULT_LOGGER_OPTIONS, stripUndefinedValues(options));
        this.includeStackTrace = safeOptions.include_stack_trace;
        this.logToConsole = safeOptions.log_to_console;
        this.permitDangerousContextProperties = safeOptions.permit_dangerous_context_properties;
        this.redactSensitiveContextKeys = safeOptions.redact_sensitive_context_keys;
        this.sensitiveContextKeyNames = safeOptions.sensitive_context_key_names;
        this.preserveUnmaskedContextPaths = safeOptions.preserve_unmasked_context_paths;
        this.allowPerCallUnmasking = safeOptions.allow_per_call_unmasking;
        this.dbNamespace = dbNamespace;
        this.maxAge = safeOptions.max_age;
        this.ulid = monotonicFactory();
        this.breakpoints = safeOptions.breakpoints;

    }

    /**
     * This is the main thing a sub class is expected to provide. Commit to storage / transport it somewhere.
     *
     * Call no `await` before the entry is committed where the store allows it: a caller that does not await
     * its write still expects the entry to be recorded straight away.
     *
     * @param _entry The finished entry, already masked by {@link prepareContext}.
     * @param _options The per-call masking directives the entry was built with.
     * @returns `{ ok: true }` once the entry is committed, or `{ ok: false, error }` saying why it was not.
     * Written by the store, never quoting the entry or a caught error's message.
     */
    protected commitEntry(_entry:LogEntry, _options?: LogCallMaskingOptions):Promise<LoggingResult> {
        throw new Error("Method not implemented");
    }

    /**
     * Describe a failure this store did not describe itself: a hook that threw or rejected, or a breakpoint
     * check that failed.
     *
     * The default names the store and what it was doing, and deliberately ignores `cause`, which can quote
     * the value that failed. Override it to add structured, non-sensitive `details` (e.g. an exception's
     * `name`), starting from `super.toFailure(operation, cause)`.
     *
     * @param operation What the store was doing.
     * @param _cause What was thrown or rejected with. It can be any value, including one that throws when
     * inspected (e.g. a revoked Proxy). Never copy its message into the failure.
     * @returns A failure whose `source` is the store's name and namespace, e.g. `MemoryLogStorage:my-app`.
     *
     * @example
     * protected override toFailure(operation: LoggingOperation, cause: unknown): LoggingFailure {
     *     const failure = super.toFailure(operation, cause);
     *     return cause instanceof DOMException ? { ...failure, details: { name: cause.name } } : failure;
     * }
     *
     * @remarks
     * An override that throws (e.g. while inspecting `cause`) costs only its `details`: the store answers with
     * the default failure instead.
     */
    protected toFailure(operation: LoggingOperation, _cause: unknown): LoggingFailure {
        return this.#genericFailure(operation);
    }

    /**
     * Describe a failure with {@link toFailure}, falling back to the generic failure if it throws, so that
     * describing a failure can never itself break a call.
     */
    #describe(operation: LoggingOperation, cause: unknown): LoggingFailure {
        try {
            return this.toFailure(operation, cause);
        } catch {
            return this.#genericFailure(operation);
        }
    }

    #genericFailure(operation: LoggingOperation): LoggingFailure {
        return { source: this.#failureSource(), operation, message: GENERIC_FAILURE_MESSAGES[operation] };
    }

    /**
     * The store's name and namespace. The namespace is the one caller-provided value a failure carries, so it
     * is masked the same way logged context is first.
     */
    #failureSource(): string {
        const namespace = cloneToJsonSafeUnknown(this.dbNamespace, { strip_sensitive_info: true });
        return typeof namespace === 'string' && namespace !== '' ? `${this.storeName}:${namespace}` : this.storeName;
    }

    /**
     * Retrieve the entries matching the filters. Called by {@link get}.
     *
     * @param _filter Match entries against this where-filter.
     * @param _fullTextFilter Match entries whose JSON contains this text.
     * @returns `{ ok: true, entries }`, or a failed result saying why the entries could not be read, with
     * whatever entries were obtained (usually none).
     */
    protected queryEntries<T extends LogEntry = LogEntry>(_filter?: WhereFilterDefinition<T>, _fullTextFilter?: string): Promise<LogReadResult<T>> {
        throw new Error("Method not implemented");
    }

    /**
     * Replace every entry with `_entries` (none if omitted). Called by {@link reset}.
     *
     * @returns `{ ok: true }`, or `{ ok: false, error }` saying why the entries could not be reset.
     */
    protected resetEntries(_entries?: LogEntry[]): Promise<LoggingResult> {
        throw new Error("Method not implemented");
    }

    /**
     * Remove entries older than their maximum age (`max_age`). Called by {@link forceClearOldEntries}.
     *
     * @returns `{ ok: true }`, or `{ ok: false, error }` saying why old entries could not be removed.
     */
    protected clearOldEntries(): Promise<LoggingResult> {
        throw new Error("Method not implemented");
    }


    /**
     * Remove entries older than their maximum age (`max_age`) now, rather than waiting for the store to.
     *
     * @returns `{ ok: true }`, or `{ ok: false, error }`. Never rejects; a failure is also told to
     * {@link onFailure} listeners.
     */
    public async forceClearOldEntries(): Promise<LoggingResult> {
        const deliverFailure = !isInsideFailureListener();
        return this.#settle(await this.#answer('clear_old_entries', () => this.clearOldEntries(), isLoggingResult, result => result), deliverFailure);
    }

    /**
     * Replace every entry in the store with `entries`, or remove them all if omitted.
     *
     * @returns `{ ok: true }`, or `{ ok: false, error }`. Never rejects; a failure is also told to
     * {@link onFailure} listeners.
     */
    public async reset(entries?: LogEntry[]): Promise<LoggingResult> {
        const deliverFailure = !isInsideFailureListener();
        return this.#settle(await this.#answer('reset', () => this.resetEntries(entries), isLoggingResult, result => result), deliverFailure);
    }

    /**
     * Retrieve the entries matching the filters, oldest first.
     *
     * @param filter Match entries against this where-filter.
     * @param fullTextFilter Match entries whose JSON contains this text.
     * @returns `{ ok: true, entries }`, or `{ ok: false, entries, error }`, where `entries` holds whatever was
     * obtained (e.g. the healthy children of a `ChannelsLogStorage`). Never rejects; a failure is also told
     * to {@link onFailure} listeners.
     */
    public async get<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
        const deliverFailure = !isInsideFailureListener();
        const read = await this.#answer('read', () => this.queryEntries(filter, fullTextFilter), isLogReadResult, result => ({ ...result, entries: [] }));
        return this.#settle(read, deliverFailure);
    }

    /**
     * (Optionally) remove sensitive information from the context during `add`.
     * @param context
     * @param options Per-call masking directives; their `preserve_unmasked_context_paths` are merged with the
     * storage-level allowlist ONLY when this storage has `allow_per_call_unmasking: true` (fail-closed gate).
     */
    protected prepareContext(context?: any, options?: LogCallMaskingOptions) {
        if( context ) {
            // Per-call directives are honored ONLY when this storage explicitly opted in; otherwise they are
            // dropped and context is masked exactly as if none were supplied. The storage-level allowlist is
            // always applied; per-call paths only ever ADD to it, never replace or loosen the gate.
            const callPaths = this.allowPerCallUnmasking ? (options?.preserve_unmasked_context_paths ?? []) : [];
            return cloneToJsonSafeUnknown(
                context,
                {
                    // Leave a `redact:<Type>` trace for values that cannot be logged as JSON (bigint, Date, …),
                    // so debugging context shows something was there rather than silently dropping it.
                    non_serialisable_handling: 'redact',
                    // A circular context must never throw while being logged: the back-edge is dropped so the
                    // rest of the context is still captured rather than losing the whole entry.
                    skip_circular: true,
                    strip_sensitive_info: true,
                    allow_sensitive_in_dangerous_properties: this.permitDangerousContextProperties,
                    // Key-name redaction: mask a value because its KEY names a secret (password/apiKey/…),
                    // regardless of the value's shape — catches weak secrets the value-shape net leaves readable.
                    // On by default; `sensitive_context_key_names` replaces the built-in list when supplied.
                    redact_sensitive_keys: this.redactSensitiveContextKeys,
                    sensitive_key_names: this.sensitiveContextKeyNames,
                    // Path+shape allowlist: keep chosen non-secret identifiers (e.g. a UUID at `user.id`)
                    // correlatable in logs while everything else is still scrubbed. Context-root-relative
                    // because the cloned root IS the context object.
                    preserve_unmasked_paths: [...this.preserveUnmaskedContextPaths, ...callPaths]
                }
            )
        } else {
            return undefined;
        }
    }

    /**
     * Build the entry, commit it with {@link commitEntry}, check it against breakpoints, and echo it to the
     * console if `log_to_console` is set.
     *
     * @returns `{ ok: true, entry }`, or `{ ok: false, entry, error }` listing every step that failed. A
     * failed breakpoint check or console echo fails the result even though the entry was recorded. Never
     * rejects; a failure is also told to {@link onFailure} listeners.
     */
    async add<C extends any>(acceptEntry: AcceptLogEntry<C>, options?: LogCallMaskingOptions): Promise<LogWriteResult<C>> {
        const deliverFailure = !isInsideFailureListener();

        let logEntry: LogEntry;
        try {
            // Called directly from `add`, so the trace starts at the caller of `add` (see generateStackTrace).
            const stackTrace:string | undefined = this.includeStackTrace[acceptEntry.type]? this.generateStackTrace() : undefined;

            logEntry = {
                ...acceptEntry,
                timestamp: Date.now(),
                context: this.prepareContext(acceptEntry.context, options),
                stack_trace: acceptEntry.stack_trace ?? stackTrace,
                ulid: acceptEntry.ulid ?? this.ulid()
            }
        } catch(cause) {
            return this.#settle(failed(this.#describe('write', cause)), deliverFailure);
        }

        const committed = await this.#answer('write', () => this.commitEntry(logEntry, options), isLoggingResult, result => result);
        const afterwards = [...await this.#testBreakpoints(logEntry), ...this.#echoToConsole(logEntry)];
        const outcome = afterwards.length===0? committed : resultFrom([...(committed.error?.failures ?? []), ...afterwards]);

        return this.#settle(outcome.ok? { ok: true, entry: logEntry } : { ok: false, error: outcome.error, entry: logEntry }, deliverFailure);
    }

    /**
     * Run a hook, turning a throw, a rejection or a malformed answer into a failure described by
     * {@link toFailure}, which `crashed` completes with the payload the caller always gets (e.g. no entries).
     */
    async #answer<A extends LoggingResult>(operation: LoggingOperation, hook: () => Promise<A>, isWellFormed: (answer: unknown) => boolean, crashed: (failure: LoggingFailed) => A): Promise<A> {
        try {
            const answer = await hook();
            return isWellFormed(answer)? answer : crashed(failed(this.#describe(operation, answer)));
        } catch(cause) {
            return crashed(failed(this.#describe(operation, cause)));
        }
    }

    async #testBreakpoints(logEntry: LogEntry): Promise<LoggingFailure[]> {
        try {
            await this.breakpoints?.test(logEntry);
            return [];
        } catch(cause) {
            return [this.#describe('breakpoint', cause)];
        }
    }

    #echoToConsole(logEntry: LogEntry): LoggingFailure[] {
        if( !this.logToConsole || logEntry.type==='event' ) return [];
        try {
            console.log(`[Log ${this.dbNamespace}] ${logEntry.message}`, logEntry.context);
            return [];
        } catch(cause) {
            return [{ ...this.#describe('write', cause), message: 'Could not echo the entry to the console.' }];
        }
    }

    /**
     * Tell the failure listeners about a failed result (unless the call started inside a listener), and
     * return it unchanged.
     */
    #settle<R extends LoggingResult>(result: R, deliverFailure: boolean): R {
        if( result.error && deliverFailure ) this.#failureListeners.deliver(result.error);
        return result;
    }

    

    /**
     * Helper to create a stack trace back to before the log call. 
     * @returns 
     */
    protected generateStackTrace() {
        try {
            throw new Error('Generate stack trace');
        } catch (e) {
            if (e instanceof Error) {
                let stack = e.stack || 'No stack trace available';
                // Remove the first lines containing the error message and this function call line
                stack = stack.split('\n').slice(3).join('\n');
                return stack;
            }
            return 'Error object is not an instance of Error';
        }
    }


    public onFailure(listener: LoggingFailureListener): () => void {
        return this.#failureListeners.subscribe(listener);
    }

    public reportInternalFailure(error: LoggingError): void {
        if( !isInsideFailureListener() ) this.#failureListeners.deliver(error);
    }


}

/**
 * Shallow copy of `obj` with any explicitly-`undefined` properties dropped.
 *
 * Why: lets `Object.assign({}, DEFAULTS, stripUndefinedValues(options))` keep the default for any
 * option the caller passed as `undefined`, rather than overwriting it — the merge footgun that
 * otherwise crashed the first log via `[...preserve_unmasked_context_paths]` / `include_stack_trace[type]`.
 */
function stripUndefinedValues<T extends object>(obj: T | undefined): Partial<T> {
    if( !obj ) return {};
    const out: Partial<T> = {};
    for( const key of Object.getOwnPropertyNames(obj) as (keyof T)[] ) {
        if( obj[key] !== undefined ) {
            out[key] = obj[key];
        }
    }
    return out;
}

/**
 * What a store's failure says when the store did not describe it itself.
 */
const GENERIC_FAILURE_MESSAGES: Record<LoggingOperation, string> = {
    write: 'Could not record the entry.',
    read: 'Could not read the entries.',
    reset: 'Could not reset the entries.',
    clear_old_entries: 'Could not clear old entries.',
    breakpoint: 'Could not check the entry against breakpoints.',
    unexpected: 'Failed unexpectedly.',
}

const DEFAULT_LOGGER_OPTIONS:Required<LogStorageOptions> = {
    include_stack_trace: {
        debug: false,
        info: false,
        warn: true,
        error: true,
        critical: true,
        event: false
    },
    log_to_console: false,
    permit_dangerous_context_properties: false,
    redact_sensitive_context_keys: true,
    sensitive_context_key_names: BUILT_IN_SENSITIVE_KEYS,
    preserve_unmasked_context_paths: [],
    allow_per_call_unmasking: false,
    max_age: [],
    breakpoints: null
}
