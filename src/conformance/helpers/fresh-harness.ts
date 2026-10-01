import { onTestFinished } from 'vitest';
import type { LogStorageOptions } from "../../log-storage/types.ts";
import type { ImplLogStorageHarness, LogStorageConformanceContext } from "../harness-types.ts";


let built = 0;

/**
 * Build a harness over a substrate no other harness uses, released when the test finishes.
 *
 * Call it inside a test, never while registering one, so a skipped test builds nothing. Each harness gets a
 * namespace no earlier one had (`conformance-1`, `conformance-2`, …), counted rather than drawn from the
 * clock or randomness, so a run replays the same.
 *
 * @param options The configuration the store under test is constructed with.
 * @returns The factory's harness, whose `dispose` runs at most once however often it is called.
 */
export async function freshHarness(ctx: LogStorageConformanceContext, options?: LogStorageOptions): Promise<ImplLogStorageHarness> {
    const harness = await ctx.factory({ namespace: `conformance-${++built}`, options });
    let disposing: Promise<void> | undefined;
    const dispose = () => disposing ??= harness.dispose();
    onTestFinished(() => dispose());
    return { ...harness, dispose };
}
