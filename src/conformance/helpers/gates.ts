import type { ImplLogStorageHarness } from "../harness-types.ts";


/**
 * Why a claim about what a store holds does not bind this store: it keeps nothing, or its substrate cannot be
 * observed. `undefined` when it binds.
 */
export function unlessObservable(harness: ImplLogStorageHarness): string | undefined {
    if( harness.capabilities.substrate.mode === 'none' ) return 'Binds stores that keep entries; this store keeps none.';
    if( !harness.raw ) return 'Needs raw access to the substrate: the store must prove this rule in its own tests.';
    return undefined;
}

/** Why a claim about instances sharing a substrate does not bind this store. `undefined` when it binds. */
export function unlessShared(harness: ImplLogStorageHarness): string | undefined {
    const { mode } = harness.capabilities.substrate;
    return mode === 'shared' ? undefined : `Binds stores whose substrate several live instances can share; this store declares a substrate of '${mode}'.`;
}

/** Why a claim about upgrading old entries does not bind this store. `undefined` when it binds. */
export function unlessMigrating(harness: ImplLogStorageHarness): string | undefined {
    const { migration } = harness.capabilities;
    return migration.mode === 'migrates' ? undefined : `Declared not to migrate: ${migration.because}`;
}
