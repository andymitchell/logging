import type { LogStorageOptions } from "../../log-storage/types.ts";
import type { ImplLogStorageHarness } from "../harness-types.ts";


/**
 * One thing a decision says every store it binds must do, checked against a store built by a harness.
 *
 * The suite registers each claim as a test, and the calibration runs the same claim against deliberately
 * broken stores, so the gate and the check live in one place.
 */
export type ConformanceClaim = {
    /** The test's name: the outcome, then the slug of each decision it proves, e.g. `'… [dec-add-rejects-invalid-entry]'`. */
    name: string;
    /** The options the store under test is constructed with. */
    options?: LogStorageOptions;
    /**
     * Why the claim does not bind this harness's store, naming what the store owes instead. `undefined` when
     * it binds. A claim with no gate binds every store.
     */
    skipReason?: (harness: ImplLogStorageHarness) => string | undefined;
    /** Check the claim. Fails through `expect` when the store breaks it. */
    check: (harness: ImplLogStorageHarness) => Promise<void>;
};


/** A decision, as the plain-English rule its tests are grouped under, and the claims that prove it. */
export type ConformanceRule = {
    /** The rule, led by the slug of each decision, e.g. `'[dec-add-rejects-invalid-entry] add refuses …'`. */
    rule: string;
    claims: readonly ConformanceClaim[];
};
