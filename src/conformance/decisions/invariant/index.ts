import type { LogStorageConformanceContext } from "../../harness-types.ts";
import { registerRules } from "../../helpers/register-rules.ts";
import { onlyCurrentEntriesEverComeOut } from "./assertions.ts";


/**
 * The rule every door upholds together: a store holds and returns only current, valid entries. It binds every
 * store, and writes underneath the store when the harness can.
 */
export function runInvariantDecisions(ctx: LogStorageConformanceContext): void {
    registerRules(ctx, [
        {
            rule: '[dec-store-only-holds-current-entries] a store only ever holds, and only ever returns, current entries',
            claims: [onlyCurrentEntriesEverComeOut],
        },
    ]);
}
