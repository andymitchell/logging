import { describe, expect, it } from 'vitest';
import type { ImplLogStorageHarness, LogStorageConformanceContext, LogStorageHarnessParams } from "../harness-types.ts";
import { MemoryLogStorage } from "../../log-storage/memory/MemoryLogStorage.ts";
import { freshHarness } from "./fresh-harness.ts";


/** A suite context whose factory records what it was asked for, and how often each harness was disposed. */
function recordingContext(): { ctx: LogStorageConformanceContext, asked: LogStorageHarnessParams[], disposals: number[] } {
    const asked: LogStorageHarnessParams[] = [];
    const disposals: number[] = [];
    const ctx: LogStorageConformanceContext = {
        factory: async params => {
            const index = asked.push(params) - 1;
            disposals[index] = 0;
            const store = new MemoryLogStorage(params.namespace, params.options);
            const harness: ImplLogStorageHarness = {
                capabilities: { substrate: { mode: 'private' }, migration: { mode: 'migrates' } },
                instance: async () => store,
                dispose: async () => { disposals[index]!++; },
            };
            return harness;
        },
    };
    return { ctx, asked, disposals };
}


describe('a suite building a fresh harness for each test [dec-conformance-harness-factory]', () => {

    it('names every harness\'s substrate differently, so no two share a substrate [dec-conformance-harness-factory]', async () => {
        const { ctx, asked } = recordingContext();

        await Promise.all([freshHarness(ctx), freshHarness(ctx), freshHarness(ctx)]);

        expect(new Set(asked.map(params => params.namespace)).size).toBe(3);
    });

    it('builds the store with the options the test is about [dec-conformance-harness-factory]', async () => {
        const { ctx, asked } = recordingContext();
        const options = { max_age: [{ max_ms: 60_000 }] };

        await freshHarness(ctx, options);

        expect(asked.map(params => params.options)).toEqual([options]);
    });

    it('releases a harness once, however often it is disposed [dec-conformance-harness-factory]', async () => {
        const { ctx, disposals } = recordingContext();
        const harness = await freshHarness(ctx);

        await Promise.all([harness.dispose(), harness.dispose()]);
        await harness.dispose();

        expect(disposals).toEqual([1]);
    });
});
