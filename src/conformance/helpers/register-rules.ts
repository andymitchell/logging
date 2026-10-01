import { describe, it } from 'vitest';
import type { ImplLogStorageHarness, LogStorageConformanceContext } from "../harness-types.ts";
import type { ConformanceClaim, ConformanceRule } from "../decisions/types.ts";
import { freezeClock } from "./clock.ts";
import { freshHarness } from "./fresh-harness.ts";


/**
 * Register each rule as a `describe`, and each of its claims as a test. A claim whose gate says it does not
 * bind the store shows as skipped, with the gate's reason.
 */
export function registerRules(ctx: LogStorageConformanceContext, rules: readonly ConformanceRule[]): void {
    for( const { rule, claims } of rules ) {
        describe(rule, () => {
            for( const claim of claims ) {
                it(claim.name, async ({ skip }) => {
                    const harness = await harnessFor(ctx, claim);
                    const reason = claim.skipReason?.(harness);
                    if( reason !== undefined ) return skip(reason);
                    await claim.check(harness);
                });
            }
        });
    }
}

/**
 * The harness a claim is checked against: a fresh one, constructed with the claim's options, under a clock
 * stopped at a fixed time.
 */
export async function harnessFor(ctx: LogStorageConformanceContext, claim: ConformanceClaim): Promise<ImplLogStorageHarness> {
    freezeClock();
    return freshHarness(ctx, claim.options);
}
