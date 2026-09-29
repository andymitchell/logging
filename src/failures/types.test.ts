import { describe, it, expectTypeOf } from 'vitest';
import type { JsonValue } from "@andymitchell/clone-to-json-safe";
import type { ILogStorage, LogEntry } from "../log-storage/types.ts";
import type { SpanMeta, TraceEntry } from "../trace/types.ts";
import type { Span } from "../trace/Span.ts";
import type { GetTracesResult, ITraceViewer, TraceSearchResults } from "../trace/viewing/types.ts";
import type { ILogger, MinimumContext } from "../types.ts";
import type { LogReadResult, LogWriteResult, LoggingError, LoggingFailure, LoggingFailureListener, LoggingOperation, LoggingResult } from "./types.ts";

// These are compile-time contracts, checked by `tsc`. The functions below are never called: they exist so the
// type checker sees each access and narrowing exactly as a consumer would write it.

type Ctx = { a: number };

describe('failure and result types', () => {

    describe('a caller reading a write result', () => {

        it('reads the entry and the error without narrowing first', () => {
            const read = (r: LogWriteResult<Ctx>) => {
                expectTypeOf(r.entry).toEqualTypeOf<LogEntry<Ctx> | undefined>();
                expectTypeOf(r.error).toEqualTypeOf<LoggingError | undefined>();
                expectTypeOf(r.error?.message).toEqualTypeOf<string | undefined>();
            };
            void read;
        });

        it('gets a definite entry once ok is true, and a definite error once it is false', () => {
            const read = (r: LogWriteResult<Ctx>) => {
                if (r.ok) {
                    expectTypeOf(r.entry).toEqualTypeOf<LogEntry<Ctx>>();
                    expectTypeOf(r.error).toEqualTypeOf<undefined>();
                } else {
                    expectTypeOf(r.error).toEqualTypeOf<LoggingError>();
                    expectTypeOf(r.entry).toEqualTypeOf<LogEntry<Ctx> | undefined>();
                }
            };
            void read;
        });

        it('narrows the same way when checking for an error instead of ok', () => {
            const read = (r: LogWriteResult<Ctx>) => {
                if (r.error) {
                    expectTypeOf(r.ok).toEqualTypeOf<false>();
                } else {
                    expectTypeOf(r.ok).toEqualTypeOf<true>();
                    expectTypeOf(r.entry).toEqualTypeOf<LogEntry<Ctx>>();
                }
            };
            void read;
        });

        it('lets a span result stand in for a logger result, but not the reverse', () => {
            expectTypeOf<LogWriteResult<Ctx, SpanMeta>>().toExtend<LogWriteResult<Ctx, MinimumContext>>();
            expectTypeOf<LogWriteResult<Ctx, MinimumContext>>().not.toExtend<LogWriteResult<Ctx, SpanMeta>>();
        });
    });

    describe('a store author building a write result', () => {

        it('may return a failure with or without the entry that was built', () => {
            const build = (entry: LogEntry, error: LoggingError) => {
                const withEntry: LogWriteResult = { ok: false, error, entry };
                const withoutEntry: LogWriteResult = { ok: false, error };
                void withEntry; void withoutEntry;
            };
            void build;
        });

        it('cannot report success with an error, success without an entry, or failure without an error', () => {
            const build = (entry: LogEntry, error: LoggingError) => {
                // @ts-expect-error success never carries an error
                const successWithError: LogWriteResult = { ok: true, entry, error };
                // @ts-expect-error success always carries the entry
                const successWithoutEntry: LogWriteResult = { ok: true };
                // @ts-expect-error failure always carries the error
                const failureWithoutError: LogWriteResult = { ok: false, entry };
                void successWithError; void successWithoutEntry; void failureWithoutError;
            };
            void build;
        });
    });

    describe('a caller reading entries', () => {

        it('always has an entries array, whether or not the read succeeded', () => {
            const read = (r: LogReadResult<LogEntry<Ctx>>) => {
                expectTypeOf(r.entries).toEqualTypeOf<LogEntry<Ctx>[]>();
                expectTypeOf(r.error).toEqualTypeOf<LoggingError | undefined>();
                if (!r.ok) expectTypeOf(r.entries).toEqualTypeOf<LogEntry<Ctx>[]>();
            };
            void read;
        });

        it('rejects a failed read that omits the entries it did obtain', () => {
            const build = (error: LoggingError) => {
                // @ts-expect-error a read always carries entries, even when empty
                const bad: LogReadResult = { ok: false, error };
                const good: LogReadResult = { ok: false, error, entries: [] };
                void bad; void good;
            };
            void build;
        });
    });

    describe('a caller reading traces', () => {

        it('always has a traces array, and narrows like every other result', () => {
            const read = (r: GetTracesResult<Ctx>) => {
                expectTypeOf(r.traces).toEqualTypeOf<TraceSearchResults<Ctx>>();
                expectTypeOf(r.error).toEqualTypeOf<LoggingError | undefined>();
                if (r.ok) expectTypeOf(r.error).toEqualTypeOf<undefined>();
            };
            void read;
        });

        it('rejects a failed trace search that omits the traces it did obtain', () => {
            const build = (error: LoggingError) => {
                // @ts-expect-error a trace search always carries traces, even when empty
                const bad: GetTracesResult = { ok: false, error };
                void bad;
            };
            void build;
        });
    });

    describe('a caller running an admin operation', () => {

        it('has no payload, and error only on failure', () => {
            const read = (r: LoggingResult) => {
                expectTypeOf(r.error).toEqualTypeOf<LoggingError | undefined>();
                if (!r.ok) expectTypeOf(r.error.failures).toEqualTypeOf<[LoggingFailure, ...LoggingFailure[]]>();
            };
            void read;
        });
    });

    describe('an app forwarding an error to its own reporter', () => {

        it('can hand the error over as JSON without converting it', () => {
            expectTypeOf<LoggingError>().toExtend<JsonValue>();
            expectTypeOf<LoggingFailure>().toExtend<JsonValue>();
        });

        it('always finds at least one failure', () => {
            const read = (e: LoggingError) => {
                const first = e.failures[0];
                expectTypeOf(first).toEqualTypeOf<LoggingFailure>();
            };
            void read;
        });

        it('rejects an error that lists no failures', () => {
            // @ts-expect-error an error names at least one failure
            const bad: LoggingError = { message: 'x', failures: [] };
            void bad;
        });
    });

    describe('a failure record', () => {

        it('names one of a closed set of operations', () => {
            expectTypeOf<LoggingOperation>().toEqualTypeOf<'write' | 'read' | 'reset' | 'clear_old_entries' | 'breakpoint' | 'unexpected'>();
        });

        it('cannot carry a raw caught value, an Error or a function as its details', () => {
            const build = (caught: unknown) => {
                // @ts-expect-error details are JSON written by the store, never the caught value itself
                const rawCause: LoggingFailure = { source: 's', operation: 'write', message: 'm', details: caught };
                // @ts-expect-error an Error instance is not JSON
                const errorDetails: LoggingFailure = { source: 's', operation: 'write', message: 'm', details: new Error('boom') };
                // @ts-expect-error a function is not JSON
                const fnDetails: LoggingFailure = { source: 's', operation: 'write', message: 'm', details: () => 1 };
                const jsonDetails: LoggingFailure = { source: 's', operation: 'write', message: 'm', details: { name: 'QuotaExceededError', status: 507 } };
                void rawCause; void errorDetails; void fnDetails; void jsonDetails;
            };
            void build;
        });
    });

    describe('a failure listener', () => {

        it('may be synchronous or asynchronous', () => {
            expectTypeOf((_error: LoggingError) => {}).toExtend<LoggingFailureListener>();
            expectTypeOf(async (_error: LoggingError) => {}).toExtend<LoggingFailureListener>();
        });

        it('receives the whole error, not a single failure', () => {
            expectTypeOf<Parameters<LoggingFailureListener>>().toEqualTypeOf<[error: LoggingError]>();
            expectTypeOf((_failure: LoggingFailure) => {}).not.toExtend<LoggingFailureListener>();
        });
    });

    describe('an app calling the public read and admin methods', () => {

        it('gets a read result typed by the entries it asked for from a store', () => {
            const read = (storage: ILogStorage) => {
                expectTypeOf(storage.get()).toEqualTypeOf<Promise<LogReadResult<LogEntry>>>();
                expectTypeOf(storage.get<TraceEntry>()).toEqualTypeOf<Promise<LogReadResult<TraceEntry>>>();
            };
            void read;
        });

        it('gets a result with no payload from reset and forceClearOldEntries', () => {
            const admin = (storage: ILogStorage) => {
                expectTypeOf(storage.reset()).toEqualTypeOf<Promise<LoggingResult>>();
                expectTypeOf(storage.forceClearOldEntries()).toEqualTypeOf<Promise<LoggingResult>>();
            };
            void admin;
        });

        it('gets a read result from a logger or a span, and a span\'s stands in for a logger\'s', () => {
            expectTypeOf<ReturnType<ILogger['get']>>().toEqualTypeOf<Promise<LogReadResult>>();
            expectTypeOf<Awaited<ReturnType<Span['get']>>>().toEqualTypeOf<LogReadResult<LogEntry<any, SpanMeta>>>();
            expectTypeOf<Span['get']>().toExtend<ILogger['get']>();
        });

        it('gets a trace search result typed by the context it asked for from a trace viewer', () => {
            const view = (viewer: ITraceViewer) => {
                expectTypeOf(viewer.getTraces<Ctx>()).toEqualTypeOf<Promise<GetTracesResult<Ctx>>>();
            };
            void view;
        });
    });
});
