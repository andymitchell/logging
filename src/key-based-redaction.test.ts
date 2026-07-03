import { describe, it, expect } from 'vitest';
import { MemoryLogStorage } from "./log-storage/memory/MemoryLogStorage.ts";
import { BUILT_IN_SENSITIVE_KEYS } from "./index-universal-logstorage.ts";
import type { LogStorageOptions } from "./log-storage/types.ts";

/**
 * Key-name redaction at the logging boundary: a context value is masked because its KEY names a secret
 * (password/apiKey/…), regardless of the value's shape — closing the gap the value-shape masker leaves on a
 * weak secret like `{ password: 'Password1' }`. Masking is always on for a storage, so key redaction is ON by
 * default; `redact_sensitive_context_keys: false` disables it and `sensitive_context_key_names` replaces the
 * built-in list. The behaviour lives in BaseLogStorage.prepareContext, so every storage inherits it (exercised
 * here through MemoryLogStorage).
 *
 * These assert exact OUTPUT values (the marker vs a readable value): the whole point is a security guarantee
 * about what reaches persisted logs.
 */

const MARKER = 'redact:sensitive-key';

/** Logs `context` through a MemoryLogStorage built with `options`, and returns the persisted (masked) context. */
async function loggedContext(context: unknown, options?: LogStorageOptions): Promise<any> {
    const storage = new MemoryLogStorage('', options);
    await storage.add({ type: 'info', message: 'm', context });
    return (await storage.get())[0]!.context;
}

describe('key-name redaction is ON by default for logged context', () => {

    it('redacts a value whose key names a secret, whatever the value shape', async () => {
        const ctx = await loggedContext({ password: 'Password1', note: 'hello' });
        expect(ctx.password).toBe(MARKER);
        expect(ctx.note).toBe('hello'); // a benign key is untouched
    });

    it('catches a weak secret that value-shape masking deliberately leaves readable under a benign key', async () => {
        // 'Password1' is a Word+Digits shape the high-precision value net cannot tell from a benign token, so
        // under a benign key it stays readable — the KEY name is the only signal.
        const benign = await loggedContext({ label: 'Password1' });
        expect(benign.label).toBe('Password1');

        const secret = await loggedContext({ password: 'Password1' });
        expect(secret.password).toBe(MARKER);
    });

    it('collapses a whole sensitive subtree to one marker without leaking nested field names', async () => {
        const ctx = await loggedContext({ credentials: { username: 'bob', apiKey: 'sk_live_abc' } });
        expect(ctx.credentials).toBe(MARKER);
        const serialised = JSON.stringify(ctx);
        expect(serialised).not.toContain('username');
        expect(serialised).not.toContain('apiKey');
        expect(serialised).not.toContain('bob');
    });

    it('matches sensitive names inside compound keys across naming conventions', async () => {
        const ctx = await loggedContext({ dbPassword: 'x', 'x-api-key': 'y', userSsn: 'z', firstName: 'Bob' });
        expect(ctx.dbPassword).toBe(MARKER);
        expect(ctx['x-api-key']).toBe(MARKER);
        expect(ctx.userSsn).toBe(MARKER);
        expect(ctx.firstName).toBe('Bob'); // a benign compound key is not touched
    });
});

describe('the two controls that tune key-name redaction', () => {

    it('redact_sensitive_context_keys:false disables key redaction while value-shape masking stays on', async () => {
        // An email under `password`: key redaction off, but the value net still masks the email — proving the
        // two controls are independent.
        const ctx = await loggedContext({ password: 'bob@gmail.com' }, { redact_sensitive_context_keys: false });
        expect(ctx.password).toBe('b...@...ail.com');
    });

    it('sensitive_context_key_names REPLACES the built-in list', async () => {
        const ctx = await loggedContext(
            { password: 'hello', wombat: 'hello' },
            { sensitive_context_key_names: ['wombat'] },
        );
        expect(ctx.wombat).toBe(MARKER);    // now sensitive
        expect(ctx.password).toBe('hello'); // no longer listed → benign key → left alone
    });

    it('the built-in list can be EXTENDED by spreading the re-exported BUILT_IN_SENSITIVE_KEYS', async () => {
        const ctx = await loggedContext(
            { password: 'hello', wombat: 'hello' },
            { sensitive_context_key_names: [...BUILT_IN_SENSITIVE_KEYS, 'wombat'] },
        );
        expect(ctx.password).toBe(MARKER); // still covered by the built-ins
        expect(ctx.wombat).toBe(MARKER);   // plus the added name
    });
});

describe('key redaction composes with the existing masking exemptions', () => {

    it('a _dangerous-prefixed sensitive key is preserved when the dangerous hatch is on', async () => {
        const ctx = await loggedContext(
            { _dangerous_password: 'Password1' },
            { permit_dangerous_context_properties: true },
        );
        expect(ctx._dangerous_password).toBe('Password1'); // deliberate-exposure hatch preserves it
    });

    it('key redaction wins over a path+shape allowlist entry at a sensitive key', async () => {
        const UUID = '550e8400-e29b-41d4-a716-446655440000';
        const ctx = await loggedContext(
            { apiKey: UUID },
            { preserve_unmasked_context_paths: [{ path: 'apiKey', shape: 'uuid' }] },
        );
        expect(ctx.apiKey).toBe(MARKER); // the sensitive KEY overrides the value-shape preservation
    });

    it('leaves ordinary context untouched: benign keys and values still pass through unmasked', async () => {
        const ctx = await loggedContext({ userId: 42, name: 'Bob', status: 'active' });
        expect(ctx).toEqual({ userId: 42, name: 'Bob', status: 'active' });
    });
});

describe('the built-in sensitive key-name list is re-exported for extension', () => {
    it('exposes BUILT_IN_SENSITIVE_KEYS so consumers can extend without a deep import', () => {
        expect(Array.isArray(BUILT_IN_SENSITIVE_KEYS)).toBe(true);
        expect(BUILT_IN_SENSITIVE_KEYS).toContain('password');
    });
});
