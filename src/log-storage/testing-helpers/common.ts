import { sleep } from "@andymitchell/utils";
import type { LogCallMaskingOptions, LogStorageOptions } from "../types.ts";
import type { ILogStorage, LogEntry } from "../types.ts";
import { it } from 'vitest';


const DETAIL_ITEM_MESSAGE = 'Message 1';
const DETAIL_ITEM_LITERAL = { object_literal: true };
const DETAIL_ITEM_ERROR = new Error('error1');

type CreateTestLogger = (options?: LogStorageOptions) => {
    logger: ILogStorage,
    cannot_recreate_with_same_data?: boolean,
    /**
     * 
     * @returns 
     */
    recreateWithSameData: () => ILogStorage
}

export async function commonLogStorageTests(createLogger: CreateTestLogger) {

    describe('Common Logger Tests', () => {

        it('Logger - basic', async () => {

            const logger = createLogger().logger;


            await logger.add({
                type: 'info',
                message: DETAIL_ITEM_MESSAGE,
                context: {
                    obj: DETAIL_ITEM_LITERAL,
                    err: DETAIL_ITEM_ERROR
                }
            });


            const all = await logger.get();


            // Check values
            const entry = all[0]!;


            expect(entry.type).toBe('info'); if (entry.type !== 'info') throw new Error("noop");
            expect(entry.message).toBe(DETAIL_ITEM_MESSAGE);
            expect(entry.context!.obj).toEqual(DETAIL_ITEM_LITERAL);
            expect(entry.context!.err instanceof Error).toBe(false);
            expect(entry.context!.err.message).toBe('error1');
        })

        describe('Logger context variation safety', () => {
            it('handles a string', async () => {

                const logger = createLogger().logger;


                const context = "just a string";
                await logger.add({
                    type: 'info',
                    message: DETAIL_ITEM_MESSAGE,
                    context
                });

                const all = await logger.get();

                // Check values
                const entry = all[0]!;

                expect(entry.context).toBe(context);
            })

            it('handles an array', async () => {

                const logger = createLogger().logger;


                const context = [{ a: 1 }, { b: 2 }, "string"];
                await logger.add({
                    type: 'info',
                    message: DETAIL_ITEM_MESSAGE,
                    context
                });

                const all = await logger.get();

                // Check values
                const entry = all[0]!;


                expect(entry.context).toEqual(context);
            })

            it('handles a deep array', async () => {

                const logger = createLogger().logger;


                const context = [{ a: 1, b: { c: 2 } }, "string"];
                await logger.add({
                    type: 'info',
                    message: DETAIL_ITEM_MESSAGE,
                    context
                });

                const all = await logger.get();

                // Check values
                const entry = all[0]!;


                expect(entry.context).toEqual(context);
            })


            it('cleans a deep array', async () => {

                const logger = createLogger().logger;


                const context = [{ a: 1, b: { c: 1234123412341234 } }, new Error("hello world"), "string"];
                await logger.add({
                    type: 'info',
                    message: DETAIL_ITEM_MESSAGE,
                    context
                });

                const all = await logger.get();

                // Check values
                const entry = all[0]!;


                // The Error's `stack` is an accessor; under the context redactor it is traced as
                // `redact:Getter` (never executed) rather than dropped, leaving evidence it was present.
                expect(entry.context).toEqual([{ a: 1, b: { c: "12...34" } }, { message: "hello world", stack: "redact:Getter" }, "string"]);
            })
        })

        describe('clean up', () => {

            it('cleans before max age', async () => {
                const aging = 4;
                const logger = createLogger({ max_age: [{ max_ms: aging }] }).logger;

                await logger.add({
                    type: 'info',
                    message: DETAIL_ITEM_MESSAGE,
                    context: {
                        obj: DETAIL_ITEM_LITERAL,
                        err: DETAIL_ITEM_ERROR
                    }
                });

                await sleep(aging * 2);

                await logger.add({
                    type: 'info',
                    message: `Message 2`
                });

                await logger.forceClearOldEntries();

                const all = await logger.get();
                expect(all.length).toBe(1);
                const entry = all[0]!;

                expect(entry.type).toBe('info'); if (entry.type !== 'info') throw new Error("noop");
                expect(entry.message).toBe('Message 2');

            })


            it('runs clean on constructor', async (cx) => {
                const aging = 4;
                const loggerTest = createLogger({ max_age: [{ max_ms: aging }] });
                if (loggerTest.cannot_recreate_with_same_data) cx.skip();


                await loggerTest.logger.add({
                    type: 'info',
                    message: DETAIL_ITEM_MESSAGE,
                    context: {
                        obj: DETAIL_ITEM_LITERAL,
                        err: DETAIL_ITEM_ERROR
                    }
                });

                await sleep(aging * 2);

                await loggerTest.logger.add({
                    type: 'info',
                    message: `Message 2`
                });

                const logger2 = loggerTest.recreateWithSameData();

                const all = await logger2.get();
                expect(all.length).toBe(1);
                const entry = all[0]!;

                expect(entry.type).toBe('info'); if (entry.type !== 'info') throw new Error("noop");
                expect(entry.message).toBe('Message 2');

            })

        })

        describe('get filter', () => {

            describe('WhereFilter', () => {
                it('filters OK', async () => {
                    const logger = createLogger().logger;


                    await logger.add({
                        type: 'info',
                        message: DETAIL_ITEM_MESSAGE,
                        context: {
                            obj: DETAIL_ITEM_LITERAL,
                            err: DETAIL_ITEM_ERROR
                        }
                    });


                    const filtered = await logger.get({ message: DETAIL_ITEM_MESSAGE });
                    expect(filtered.length).toBe(1);
                });

                it('filter excludes non-matches', async () => {
                    const logger = createLogger().logger;


                    await logger.add({
                        type: 'info',
                        message: DETAIL_ITEM_MESSAGE,
                        context: {
                            obj: DETAIL_ITEM_LITERAL,
                            err: DETAIL_ITEM_ERROR
                        }
                    });


                    const filtered = await logger.get({ message: 'nomatchplease' });
                    expect(filtered.length).toBe(0);
                });

                it('filter on context [regression]', async () => {

                    const logger = createLogger().logger;

                    const errorObj:LogEntry = {
                        type: 'error',
                        message: '[messaging] Timed out',
                        context: {
                            type: 'time-out',
                            location: 'sendMessage',
                            description: 'Timed out waiting for the response to helloWorld. Possible reasons: 1) no listener has been set up for it, 2) another listener responded first and blocked it. '
                        },
                        timestamp: 0,
                        ulid: 'ulid1'
                    }

                    await logger.add(errorObj);

                    const filtered = await logger.get({ type: 'error', 'context.type': 'time-out'});
                    expect(filtered[0]?.context.description).toContain('Timed out');

                })
            })

            describe('full text', () => {
                it('filters OK', async () => {
                    const logger = createLogger().logger;


                    await logger.add({
                        type: 'info',
                        message: DETAIL_ITEM_MESSAGE,
                        context: {
                            obj: DETAIL_ITEM_LITERAL,
                            err: DETAIL_ITEM_ERROR
                        }
                    });


                    const filtered = await logger.get(undefined, DETAIL_ITEM_MESSAGE);
                    expect(filtered.length).toBe(1);
                });

                it('filter excludes non-matches', async () => {
                    const logger = createLogger().logger;


                    await logger.add({
                        type: 'info',
                        message: DETAIL_ITEM_MESSAGE,
                        context: {
                            obj: DETAIL_ITEM_LITERAL,
                            err: DETAIL_ITEM_ERROR
                        }
                    });


                    const filtered = await logger.get(undefined, 'nomatchplease');
                    expect(filtered.length).toBe(0);
                });
            })


            describe('types', () => {
                it('generic customises context type', () => {
                    const logger = createLogger().logger;

                    logger.get<LogEntry<{name: string}>>({'context.name': 'Bob'});

                    // @ts-expect-error do not allow wrong type
                    logger.get<LogEntry<{name: string}>>({'context.name': 1});

                    // @ts-expect-error do not allow unknown keys
                    logger.get<LogEntry<{name: string}>>({'context.wrong': 'Bob'});
                })
            })

        })

        describe('privacy', () => {

            it('Strips token data', async () => {

                const logger = createLogger().logger;


                await logger.add({
                    type: 'info',
                    message: 'Includes bad token',
                    context: {
                        obj: {
                            abc: '123456789123456789',
                            _dangerousDef: '123456789123456789'
                        },
                    }
                });


                const all = await logger.get();


                // Check values
                const entry = all[0]!;


                expect(entry.context!.obj.abc).toEqual("12...89");
                expect(entry.context!.obj._dangerousDef).toEqual("12...89"); // Note not permitted in LogStorageOptions

            })

            it('Retains token data if marked dangerous', async () => {

                const logger = createLogger({ permit_dangerous_context_properties: true }).logger;


                await logger.add({
                    type: 'info',
                    message: 'Includes bad token',
                    context: {
                        obj: {
                            abc: '123456789123456789',
                            _dangerousDef: '123456789123456789'
                        },
                    }
                });


                const all = await logger.get();


                // Check values
                const entry = all[0]!;


                expect(entry.context!.obj.abc).toEqual("12...89");
                expect(entry.context!.obj._dangerousDef).toEqual("123456789123456789");

            })

            describe('preserve_unmasked_context_paths (path + shape unmasking)', () => {

                // A canonical UUID and ULID alongside their known masked forms when scrubbed. Asserting the
                // exact value lets each test prove an identifier is either fully readable or genuinely masked,
                // not merely that the field exists.
                const UUID = '550e8400-e29b-41d4-a716-446655440000';
                const MASKED_UUID = '550....00';
                const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

                it('masks identifiers by default — preservation is strictly opt-in', async () => {

                    const logger = createLogger().logger;

                    await logger.add({
                        type: 'info',
                        message: 'identifier with no allow-list',
                        context: { user: { id: UUID } }
                    });

                    const all = await logger.get();
                    const entry = all[0]!;

                    // Fail-closed: with no exemption a UUID is treated like any other suspicious string and
                    // scrubbed, so logs never leak ids the operator did not explicitly opt into.
                    expect(entry.context!.user.id).toBe(MASKED_UUID);
                })

                it('keeps a UUID readable only at the allow-listed path, masking the same value elsewhere', async () => {

                    const logger = createLogger({
                        preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }]
                    }).logger;

                    // The identical UUID sits at the allow-listed `user.id` and at a non-listed `audit.id`.
                    await logger.add({
                        type: 'info',
                        message: 'same id at two paths',
                        context: { user: { id: UUID }, audit: { id: UUID } }
                    });

                    const all = await logger.get();
                    const entry = all[0]!;

                    // Path-gated, and paths are context-root-relative (`user.id`, not `context.user.id`):
                    // readable where opted in…
                    expect(entry.context!.user.id).toBe(UUID);
                    // …and still masked everywhere else, so a stray copy can't ride along unmasked.
                    expect(entry.context!.audit.id).toBe(MASKED_UUID);
                })

                it('masks an allow-listed path when the value drifts off the declared shape', async () => {

                    const logger = createLogger({
                        preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }]
                    }).logger;

                    // `user.id` is allow-listed for UUIDs, but post-refactor it now holds a token-shaped secret.
                    await logger.add({
                        type: 'info',
                        message: 'value drifted off shape',
                        context: { user: { id: '123456789123456789' } }
                    });

                    const all = await logger.get();
                    const entry = all[0]!;

                    // Shape-gated: a non-UUID value at the allow-listed path is masked exactly as any other
                    // secret would be (`12...89`), so the path can't be silently left wide open on the wrong type.
                    expect(entry.context!.user.id).toBe('12...89');
                })

                it('preserves a ULID when its shape is allow-listed', async () => {

                    const logger = createLogger({
                        preserve_unmasked_context_paths: [{ path: 'trace.id', shape: 'ulid' }]
                    }).logger;

                    await logger.add({
                        type: 'info',
                        message: 'correlatable trace id',
                        context: { trace: { id: ULID } }
                    });

                    const all = await logger.get();
                    const entry = all[0]!;

                    // ULIDs are our own time-ordered ids; preserving them keeps traces correlatable in logs.
                    expect(entry.context!.trace.id).toBe(ULID);
                })

            })

            describe('allow_per_call_unmasking (per-call path + shape unmasking)', () => {

                // Same canonical identifiers as the storage-level suite, plus a token-shaped secret with its
                // known masked form. Asserting exact values proves a value is genuinely readable or genuinely
                // masked — never merely present.
                const UUID = '550e8400-e29b-41d4-a716-446655440000';
                const MASKED_UUID = '550....00';
                const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
                const SECRET = '123456789123456789';
                const MASKED_SECRET = '12...89';

                it('honors a per-call allow-list ONLY when the storage opted into per-call unmasking', async () => {

                    const directive: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] };

                    const optedIn = createLogger({ allow_per_call_unmasking: true }).logger;
                    await optedIn.add({ type: 'info', message: 'per-call id', context: { user: { id: UUID } } }, directive);
                    const inEntry = (await optedIn.get())[0]!;
                    // The storage blessed dynamic call-site directives, so this one log keeps the id readable.
                    expect(inEntry.context!.user.id).toBe(UUID);

                    const notOptedIn = createLogger().logger; // default: gate closed
                    await notOptedIn.add({ type: 'info', message: 'per-call id', context: { user: { id: UUID } } }, directive);
                    const outEntry = (await notOptedIn.get())[0]!;
                    // Identical directive at an un-blessed storage: ignored, so the id is masked like any secret.
                    expect(outEntry.context!.user.id).toBe(MASKED_UUID);
                })

                it('treats a per-call directive at a closed gate as a strict no-op — identical to passing none', async () => {

                    const context = { user: { id: UUID }, auth: { token: SECRET } };
                    const directive: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }, { path: 'auth.token', shape: 'uuid' }] };

                    const withDirective = createLogger().logger; // gate closed (default)
                    await withDirective.add({ type: 'info', message: 'inert', context }, directive);
                    const without = createLogger().logger;
                    await without.add({ type: 'info', message: 'inert', context });

                    const a = (await withDirective.get())[0]!.context;
                    const b = (await without.get())[0]!.context;
                    // A closed gate makes the directive inert: the stored context is exactly what you'd get without it.
                    expect(a).toEqual(b);
                    expect(a!.user.id).toBe(MASKED_UUID); // anchored: genuinely masked, not coincidentally equal-and-unmasked
                })

                it('unmasks ONLY the exact per-call allow-listed path, leaving every other secret masked', async () => {

                    const context = { user: { id: UUID }, auth: { token: SECRET }, audit: { id: UUID } };
                    const directive: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] };

                    const opted = createLogger({ allow_per_call_unmasking: true }).logger;
                    await opted.add({ type: 'info', message: 'surgical', context }, directive);
                    const withOpts = (await opted.get())[0]!.context;

                    // Only the named path is readable…
                    expect(withOpts!.user.id).toBe(UUID);
                    // …a different secret is untouched by the exemption…
                    expect(withOpts!.auth.token).toBe(MASKED_SECRET);
                    // …and the SAME id value at a non-listed path stays masked (a stray copy can't ride along).
                    expect(withOpts!.audit.id).toBe(MASKED_UUID);

                    // Metamorphic: versus no directive, the exemption changes EXACTLY one field (user.id) and nothing else.
                    const baseline = createLogger({ allow_per_call_unmasking: true }).logger;
                    await baseline.add({ type: 'info', message: 'surgical', context });
                    const withoutOpts = (await baseline.get())[0]!.context;
                    expect(withoutOpts!.user.id).toBe(MASKED_UUID);
                    expect({ ...withOpts, user: { id: MASKED_UUID } }).toEqual(withoutOpts);
                })

                it('applies storage-level and per-call allow-lists independently, unioning them only when the gate is open', async () => {

                    const context = { trace: { id: ULID }, user: { id: UUID } };
                    const callDirective: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] };

                    // Gate CLOSED: the storage-level trace.id is honored; the per-call user.id is ignored.
                    const closed = createLogger({ preserve_unmasked_context_paths: [{ path: 'trace.id', shape: 'ulid' }] }).logger;
                    await closed.add({ type: 'info', message: 'independent', context }, callDirective);
                    const closedCtx = (await closed.get())[0]!.context;
                    expect(closedCtx!.trace.id).toBe(ULID);        // storage-level allow-list: always on
                    expect(closedCtx!.user.id).toBe(MASKED_UUID);   // per-call: gated off

                    // Gate OPEN: both allow-lists apply (union), each value readable at its own path.
                    const open = createLogger({ preserve_unmasked_context_paths: [{ path: 'trace.id', shape: 'ulid' }], allow_per_call_unmasking: true }).logger;
                    await open.add({ type: 'info', message: 'independent', context }, callDirective);
                    const openCtx = (await open.get())[0]!.context;
                    expect(openCtx!.trace.id).toBe(ULID);
                    expect(openCtx!.user.id).toBe(UUID);
                })

                it('consumes the per-call directive at masking time without ever persisting it onto the entry', async () => {

                    const directive: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] };
                    const logger = createLogger({ allow_per_call_unmasking: true }).logger;
                    await logger.add({ type: 'info', message: 'not persisted', context: { user: { id: UUID } } }, directive);

                    const entry = (await logger.get())[0]!;
                    // Half 1 — the directive was genuinely in effect (so this isn't trivially green): the id is readable.
                    expect(entry.context!.user.id).toBe(UUID);
                    // Half 2 — yet the control metadata survives nowhere in the stored entry (out-of-band, never serialised).
                    const serialised = JSON.stringify(entry);
                    expect(serialised).not.toContain('preserve_unmasked_context_paths');
                    expect(serialised).not.toContain('allow_per_call_unmasking');
                })

                it('honors EVERY path in a multi-path per-call directive, masking only the unlisted secret', async () => {

                    // Proves the merge spreads the WHOLE call array, not just its first entry.
                    const directive: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }, { path: 'trace.id', shape: 'ulid' }] };
                    const logger = createLogger({ allow_per_call_unmasking: true }).logger;
                    await logger.add({ type: 'info', message: 'multi', context: { user: { id: UUID }, trace: { id: ULID }, auth: { token: SECRET } } }, directive);

                    const entry = (await logger.get())[0]!;
                    expect(entry.context!.user.id).toBe(UUID);          // first listed path honored
                    expect(entry.context!.trace.id).toBe(ULID);         // second listed path honored too
                    expect(entry.context!.auth.token).toBe(MASKED_SECRET); // unlisted secret still masked
                })

                it('masks a per-call allow-listed path when the value drifts off the declared shape, even with the gate open', async () => {

                    const directive: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] };
                    const logger = createLogger({ allow_per_call_unmasking: true }).logger;
                    // The path is allow-listed for UUIDs, but the value is a token-shaped secret.
                    await logger.add({ type: 'info', message: 'drift', context: { user: { id: SECRET } } }, directive);

                    const entry = (await logger.get())[0]!;
                    // Fail-closed on the per-call surface too: a non-UUID at the listed path is masked like any secret.
                    expect(entry.context!.user.id).toBe(MASKED_SECRET);
                })

                it('treats an empty per-call directive as a no-op identical to passing none, even with the gate open', async () => {

                    const empty: LogCallMaskingOptions = { preserve_unmasked_context_paths: [] };
                    const withEmpty = createLogger({ allow_per_call_unmasking: true }).logger;
                    await withEmpty.add({ type: 'info', message: 'empty', context: { user: { id: UUID } } }, empty);
                    const without = createLogger({ allow_per_call_unmasking: true }).logger;
                    await without.add({ type: 'info', message: 'empty', context: { user: { id: UUID } } });

                    const a = (await withEmpty.get())[0]!.context;
                    const b = (await without.get())[0]!.context;
                    expect(a).toEqual(b);
                    expect(a!.user.id).toBe(MASKED_UUID); // anchored: genuinely masked, gate-open empty directive added nothing
                })

            })
        })

        describe('misc', () => {
            it('Logger - serialisable', async () => {

                const logger = createLogger().logger;


                await logger.add({
                    type: 'info',
                    message: DETAIL_ITEM_MESSAGE,
                    context: {
                        obj: DETAIL_ITEM_LITERAL,
                        err: DETAIL_ITEM_ERROR
                    }
                });

                const all = await logger.get();

                const entry = all[0]!;

                expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);

            })

            it('Logger - circular context is safe', async () => {

                const logger = createLogger().logger;

                // A real-world context can be circular (e.g. a parent/child pair) while also carrying values
                // that cannot be logged as JSON (bigint, Date, Map). Logging must survive both at once.
                const message = 'circular context safe entry';
                const context: Record<string, unknown> = {
                    kept: 1,
                    when: new Date('2020-01-01T00:00:00.000Z'),
                    big: 10n,
                    map: new Map([['k', 'v']])
                };
                context.self = context; // the back-edge that would otherwise break serialisation

                await logger.add({
                    type: 'info',
                    message,
                    context
                });

                // Storing a circular submission neither throws nor loses the entry.
                const all = await logger.get();
                const entry = all[0]!;

                // A plain value survives, a non-serialisable value is redacted to a string, and the back-edge
                // is dropped — so the stored entry holds the context but is acyclic.
                expect(entry.context!.kept).toBe(1);
                expect(typeof entry.context!.big).toBe('string');
                expect('self' in entry.context!).toBe(false);

                // The entry losslessly round-trips JSON — the contract every adapter relies on to transmit.
                expect(() => JSON.stringify(entry)).not.toThrow();
                expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);

                // Full-text search serialises every entry to match; a surviving cycle would throw here.
                const found = await logger.get(undefined, message);
                expect(found.length).toBe(1);
                expect(found[0]!.message).toBe(message);

            })

            it('Logger - stack trace', async () => {

                const logger = createLogger({
                    'include_stack_trace': {
                        debug: false,
                        info: true,
                        warn: true,
                        error: true,
                        critical: true,
                        event: true
                    }
                }).logger;


                await logger.add({
                    type: 'info',
                    message: DETAIL_ITEM_MESSAGE,
                    context: {
                        obj: DETAIL_ITEM_LITERAL,
                        err: DETAIL_ITEM_ERROR
                    }
                });

                const all = await logger.get();

                const entry = all[0]!;

                // Check values
                expect(entry.stack_trace!.split("\n")[0]!.includes("common.ts")).toBe(true);
            })
        })

        describe('reset', () => {

            const sampleEntries = (count = 3): LogEntry[] =>
                Array.from({ length: count }, (_, i) => ({
                    type: 'info',
                    id: i + 1,
                    ulid: i + 1 + '',
                    timestamp: Date.now() + i,
                    message: `Test log ${i + 1}`,
                    context: {}
                }));

            it('loads entries into an empty store', async () => {
                const instance = createLogger();
                const entries = sampleEntries(3);
                await instance.logger.reset(entries);
                const result = await instance.logger.get();

                expect(result.length).toBe(3);
                expect(result.map(e => e.message)).toEqual([
                    'Test log 1',
                    'Test log 2',
                    'Test log 3'
                ]);
            });

            it('replaces existing entries with new ones', async () => {
                const instance = createLogger();
                await instance.logger.reset(sampleEntries(2));
                await instance.logger.reset(sampleEntries(1)); // only 1 new entry

                const result = await instance.logger.get();
                expect(result.length).toBe(1);
                expect(result[0]!.message).toBe('Test log 1');
            });

            it('persists data across recreated logger instances', async (cx) => {
                const instance = createLogger();
                if (instance.cannot_recreate_with_same_data) cx.skip();
                await instance.logger.reset(sampleEntries(2));

                const newLogger = instance.recreateWithSameData();
                const result = await newLogger.get();

                expect(result.length).toBe(2);
                expect(result.map(e => e.message)).toContain('Test log 1');
                expect(result.map(e => e.message)).toContain('Test log 2');
            });


        })
    })

    


}