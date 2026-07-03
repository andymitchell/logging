import { describe, it, expect } from 'vitest';
import { MemoryLogStorage } from "./log-storage/memory/MemoryLogStorage.ts";
import { Logger } from "./log/Logger.ts";
import { startTrace, startTraceWithOptions } from "./trace/startTrace.ts";
import type { LogCallMaskingOptions } from "./log-storage/types.ts";

/**
 * Cross-cutting security & scoping guarantees for per-call ("per-log") unmasking that span the Logger and
 * Trace surfaces — complementing the per-storage behaviour exercised by the common privacy suite.
 *
 * Asserts exact values (readable vs genuinely masked), and encodes the forbidden states the design must
 * never reach: per-call cannot open the value-agnostic `_dangerous` hatch, a span option must not leak to
 * later logs, and a logged value must never be mistaken for options.
 */

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const MASKED_UUID = '550....00';
const SECRET = '123456789123456789';
const MASKED_SECRET = '12...89';

describe('per-call masking: the value-agnostic _dangerous hatch can never be opened from a call', () => {

    it('omits permit_dangerous_context_properties from the per-call options type (compile-time)', () => {
        // @ts-expect-error per-call options must never carry the value-agnostic `_dangerous` escape hatch
        const o: LogCallMaskingOptions = { preserve_unmasked_context_paths: [], permit_dangerous_context_properties: true };
        expect(o).toBeDefined();
    });

    it('ignores a forced permit_dangerous flag at runtime: the legit path exemption works, the _dangerous secret stays masked', async () => {
        const storage = new MemoryLogStorage('', { allow_per_call_unmasking: true, permit_dangerous_context_properties: false });
        const logger = new Logger(storage);

        // A hostile caller forces the forbidden field past the type with a cast, alongside a legitimate path.
        const hostile = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }], permit_dangerous_context_properties: true } as LogCallMaskingOptions;
        await logger.logWithOptions(hostile, 'm', { user: { id: UUID }, _dangerousToken: SECRET });

        const e = (await storage.get())[0]!;
        // The legitimate path+shape exemption is honored…
        expect(e.context!.user.id).toBe(UUID);
        // …but the runtime never reads `permit_dangerous` from per-call options, so the `_dangerous` secret stays masked.
        expect(e.context!._dangerousToken).toBe(MASKED_SECRET);
    });

});

describe('per-call masking: span & trace options scope to the span_start context only', () => {

    it('startTraceWithOptions unmasks the new trace span_start context but NOT later logs within the span', async () => {
        const storage = new MemoryLogStorage('', { allow_per_call_unmasking: true });

        const span = startTraceWithOptions({ preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] }, 'op', { user: { id: UUID } }, storage)!;
        await span.log('later step', { user: { id: UUID } });

        const entries = await storage.get();
        const spanStart = entries.find(e => e.type === 'event')!;
        const laterLog = entries.find(e => e.message === 'later step')!;
        // The span's OWN context (span_start) honored the option…
        expect(spanStart.context!.user.id).toBe(UUID);
        // …but the option did NOT ride along to a later log in the span.
        expect(laterLog.context!.user.id).toBe(MASKED_UUID);
    });

    it('startTraceWithOptions on an existing span scopes the option to the child span_start only', async () => {
        const storage = new MemoryLogStorage('', { allow_per_call_unmasking: true });

        const parent = startTrace('parent', undefined, storage)!; // no options
        const child = startTraceWithOptions({ preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] }, 'child', { user: { id: UUID } }, undefined, parent)!;
        await child.log('later', { user: { id: UUID } });

        const entries = await storage.get();
        // The child span_start is the event entry carrying user context.
        const childStart = entries.find(e => e.type === 'event' && !!e.context?.user)!;
        const later = entries.find(e => e.message === 'later')!;
        expect(childStart.context!.user.id).toBe(UUID);
        expect(later.context!.user.id).toBe(MASKED_UUID);
    });

});

describe('per-call masking: the options slot cannot be spoofed by a logged value', () => {

    it('treats an options-shaped value logged as data as ordinary (masked) data, never as options', async () => {
        const storage = new MemoryLogStorage('', { allow_per_call_unmasking: true });
        const logger = new Logger(storage);

        // A hostile payload shaped EXACTLY like masking options, but passed in the context (data) slot of plain
        // `log`. The carried field uses a BENIGN key (`ref`) so the test isolates the options-spoofing guarantee:
        // its UUID would be readable only if the fake options were honored. (A sensitive key would be key-redacted
        // regardless, masking the very regression this test guards against.)
        const hostilePayload = { preserve_unmasked_context_paths: [{ path: 'ref', shape: 'uuid' }], ref: UUID };
        await logger.log('incoming', hostilePayload);

        const e = (await storage.get())[0]!;
        // It was treated as ordinary data and masked — the look-alike "options" had no power, because options
        // only ever arrive in the dedicated leading slot of a `*WithOptions` method, never sniffed from data.
        expect(e.context!.ref).toBe(MASKED_UUID);
    });

});

describe('per-call masking: the gate is honored at every log level (each *WithOptions is hand-written)', () => {

    const directive: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] };

    // Each *WithOptions method threads `options` individually, so a copy-paste slip in any one would be invisible
    // unless every level is exercised.
    it.each(['debug', 'log', 'warn', 'error', 'critical'] as const)('Logger.%sWithOptions keeps the allow-listed path readable', async (level) => {
        const storage = new MemoryLogStorage('', { allow_per_call_unmasking: true });
        const logger = new Logger(storage);
        await logger[`${level}WithOptions`](directive, 'm', { user: { id: UUID } });
        expect((await storage.get())[0]!.context!.user.id).toBe(UUID);
    });

    it.each(['debug', 'log', 'warn', 'error', 'critical'] as const)('Span.%sWithOptions keeps the allow-listed path readable', async (level) => {
        const storage = new MemoryLogStorage('', { allow_per_call_unmasking: true });
        const span = startTrace('t', undefined, storage)!;
        await span[`${level}WithOptions`](directive, 'step', { user: { id: UUID } });
        const logged = (await storage.get()).find(e => e.message === 'step')!;
        expect(logged.context!.user.id).toBe(UUID);
    });

});

describe('per-call masking: the call surface takes a single record context (compile-time)', () => {

    it('rejects a second context arg and a primitive context root', () => {
        const logger = new Logger(new MemoryLogStorage('', { allow_per_call_unmasking: true }));
        const directive: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] };

        // Type-only: defined, never invoked, so tsc checks the bodies without runtime side effects.
        const _typeOnly = async () => {
            // @ts-expect-error *WithOptions take a SINGLE context, never a second/rest context argument
            await logger.logWithOptions(directive, 'm', { user: { id: UUID } }, { extra: true });
            // @ts-expect-error context must be a record shape (C extends MinimumContext), not a primitive root
            await logger.logWithOptions(directive, 'm', 'a-string');
        };
        expect(typeof _typeOnly).toBe('function');
    });

});

describe('per-call masking: directive paths are typed to the logged context (compile-time)', () => {

    type Ctx = { user: { id: string }; orders: { items: { ref: string }[] } };

    it('accepts real scalar paths, including an array-of-objects spread, on a directly-typed directive', () => {
        const valid: LogCallMaskingOptions<Ctx> = {
            preserve_unmasked_context_paths: [
                { path: 'user.id', shape: 'uuid' },
                { path: 'orders.items.ref', shape: 'uuid' }, // spreads across each array element
            ],
        };
        expect(valid.preserve_unmasked_context_paths).toHaveLength(2);
    });

    it('rejects a typo and a non-scalar (the array itself, not a leaf) path at compile time', () => {
        const _typeOnly = () => {
            // @ts-expect-error 'user.nope' is not a path of Ctx
            const a: LogCallMaskingOptions<Ctx> = { preserve_unmasked_context_paths: [{ path: 'user.nope', shape: 'uuid' }] };
            // @ts-expect-error 'orders.items' addresses the array, not a scalar leaf
            const b: LogCallMaskingOptions<Ctx> = { preserve_unmasked_context_paths: [{ path: 'orders.items', shape: 'uuid' }] };
            return [a, b];
        };
        expect(typeof _typeOnly).toBe('function');
    });

    it('infers C from the logged context at the call site, narrowing the allowed paths', () => {
        const logger = new Logger(new MemoryLogStorage('', { allow_per_call_unmasking: true }));
        const ctx = { user: { id: UUID }, orders: { items: [{ ref: UUID }] } };
        const _typeOnly = async () => {
            // valid path, inferred purely from `ctx`
            await logger.logWithOptions({ preserve_unmasked_context_paths: [{ path: 'orders.items.ref', shape: 'uuid' }] }, 'm', ctx);
            // @ts-expect-error 'orders.itemz.ref' is a typo against the inferred context shape
            await logger.logWithOptions({ preserve_unmasked_context_paths: [{ path: 'orders.itemz.ref', shape: 'uuid' }] }, 'm', ctx);
        };
        expect(typeof _typeOnly).toBe('function');
    });

});
