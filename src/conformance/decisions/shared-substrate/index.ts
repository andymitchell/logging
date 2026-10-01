import type { LogStorageConformanceContext } from "../../harness-types.ts";
import { registerRules } from "../../helpers/register-rules.ts";
import { siblingsSeeEachOthersWrites, siblingsStartingTogetherConverge, theSubstrateOutlivesItsInstances } from "./assertions.ts";


/**
 * How stores behave as siblings over one shared substrate (two tabs over one IndexedDB). Proven by minting
 * siblings from one harness and checking the state they settle on, never an interleaving, so they bind every
 * store that declares a shared substrate.
 */
export function runSharedSubstrateDecisions(ctx: LogStorageConformanceContext): void {
    registerRules(ctx, [
        {
            rule: '[dec-shared-write-visibility] what one instance has written, the next read on a sibling shows',
            claims: [siblingsSeeEachOthersWrites],
        },
        {
            rule: '[dec-shared-start-up-converges] siblings starting at once over old records settle on one clean substrate',
            claims: [siblingsStartingTogetherConverge],
        },
        {
            rule: '[dec-shared-substrate-outlives-instances] the substrate belongs to no instance',
            claims: [theSubstrateOutlivesItsInstances],
        },
    ]);
}
