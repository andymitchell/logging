import { describe, it, expect } from 'vitest';
import { MemoryLogStorage } from './memory/MemoryLogStorage.ts';

/**
 * BaseLogStorage merges caller options over its defaults. Callers routinely build options
 * programmatically — e.g. `{ preserve_unmasked_context_paths: cfg.paths }` where `cfg.paths` is
 * `PreserveUnmaskedPath[] | undefined` — so an explicit `undefined` for ANY option must fall back to
 * the default, never clobber it. Otherwise a later internal array spread / index-access throws and the
 * log is silently lost.
 *
 * Regression guard: before the coalescing fix, `{ preserve_unmasked_context_paths: undefined }` crashed
 * the first *context* log (`[...undefined]`), and `{ include_stack_trace: undefined }` crashed EVERY log
 * (`undefined[type]`). Both must now be inert.
 */
const UUID = '550e8400-e29b-41d4-a716-446655440000';
const MASKED_UUID = '550....00';

describe('BaseLogStorage option defaults survive an explicit undefined override', () => {

    it('treats preserve_unmasked_context_paths:undefined as the empty default — no throw, still masks', async () => {
        const storage = new MemoryLogStorage('t', { preserve_unmasked_context_paths: undefined });
        const entry = await storage.add({ type: 'info', message: 'm', context: { user: { id: UUID } } });
        // No throw, and with no real allowlist the identifier is still masked (default [] applied).
        expect(entry.context!.user.id).toBe(MASKED_UUID);
    });

    it('treats include_stack_trace:undefined as the default — no throw on a plain log', async () => {
        const storage = new MemoryLogStorage('t', { include_stack_trace: undefined });
        const entry = await storage.add({ type: 'info', message: 'm' });
        expect(entry.type).toBe('info');
    });

    it('still honors a real allowlist after the coalescing fix (default-win must not swallow real values)', async () => {
        const storage = new MemoryLogStorage('t', { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] });
        const entry = await storage.add({ type: 'info', message: 'm', context: { user: { id: UUID } } });
        expect(entry.context!.user.id).toBe(UUID);
    });

});
