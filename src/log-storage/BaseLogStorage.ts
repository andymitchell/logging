

import { cloneToJsonSafeUnknown, BUILT_IN_SENSITIVE_KEYS } from "@andymitchell/clone-to-json-safe";
import type {  MaxAge } from "../types.ts";
import type { AcceptLogEntry, ILogStorage, LogCallMaskingOptions, LogEntry, LogStorageOptions } from "./types.ts";
import type { WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import { monotonicFactory } from "ulid";
import type { IBreakpoints } from "../breakpoints/types.ts";



/**
 * Use this to build specific LogStorage
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
     * @param _entry 
     */
    protected commitEntry(_entry:LogEntry, _options?: LogCallMaskingOptions):Promise<void> {
        throw new Error("Method not implemented");
    }

    /**
     * Remove old entries before the max age
     */
    protected async clearOldEntries() {
        throw new Error("Method not implemented");
    }


    public async forceClearOldEntries() {
        return this.clearOldEntries();
    }

    public async reset() {
        throw new Error("Method not implemented");
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

    async add<C extends any>(acceptEntry: AcceptLogEntry<C>, options?: LogCallMaskingOptions): Promise<LogEntry<C>> {
        let stackTrace:string | undefined = this.includeStackTrace[acceptEntry.type]? this.generateStackTrace() : undefined;

        const logEntry:LogEntry = {
            ...acceptEntry,
            timestamp: Date.now(),
            context: this.prepareContext(acceptEntry.context, options),
            stack_trace: acceptEntry.stack_trace ?? stackTrace,
            ulid: acceptEntry.ulid ?? this.ulid()
        }

        await this.commitEntry(logEntry, options);
        this.breakpoints?.test(logEntry);

        if( this.logToConsole && logEntry.type!=='event') {
            console.log(`[Log ${this.dbNamespace}] ${logEntry.message}`, logEntry.context);
        }

        return logEntry;
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


    public async get<T extends LogEntry = LogEntry>(filter?:WhereFilterDefinition<T>, fullTextFilter?: string): Promise<T[]> {
        throw new Error("Method not implemented");
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
