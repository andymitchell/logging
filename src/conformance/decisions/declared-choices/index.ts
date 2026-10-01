import type { LogStorageConformanceContext } from "../../harness-types.ts";
import { registerRules } from "../../helpers/register-rules.ts";
import { everyCapabilityIsDeclared, siblingsMatchTheDeclaredSubstrate } from "./assertions.ts";


/**
 * The checks on what a harness declares, which decide every skip in the suite. They never skip: a declaration
 * the harness does not back fails.
 */
export function runDeclaredChoiceDecisions(ctx: LogStorageConformanceContext): void {
    registerRules(ctx, [
        {
            rule: '[dec-conformance-declared-choices] a harness declares every capability, and backs what it declares',
            claims: [everyCapabilityIsDeclared, siblingsMatchTheDeclaredSubstrate],
        },
    ]);
}
