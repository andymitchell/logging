import { expect } from 'vitest';
import type { ConformanceClaim } from "../types.ts";
import { LogStorageCapabilitiesSchema } from "../../schemas.ts";


// Every capability is declared: a choice left out is a mistake, not an opt-out.
export const everyCapabilityIsDeclared: ConformanceClaim = {
    name: 'declares what is under the store and what it does with older entries, giving a reason if it discards them [dec-conformance-declared-choices]',
    async check(harness) {
        const declared = LogStorageCapabilitiesSchema.safeParse(harness.capabilities);

        expect(declared.error?.issues.map(issue => issue.path.join('.')) ?? [], 'A capability was forgotten, not opted out of').toEqual([]);
    },
};

// A store mints a new store per instance() exactly when it declares a shared substrate.
export const siblingsMatchTheDeclaredSubstrate: ConformanceClaim = {
    name: 'builds a new store on every instance() exactly when it declares a shared substrate [dec-conformance-declared-choices] [dec-shared-substrate]',
    async check(harness) {
        const [first, second] = await Promise.all([harness.instance(), harness.instance()]);

        if( harness.capabilities.substrate.mode === 'shared' ) {
            expect(first, 'A shared substrate is declared, but instance() does not build a new store per call').not.toBe(second);
        } else {
            expect(first, 'instance() builds a new store per call, but the substrate is not declared shared').toBe(second);
        }
    },
};
