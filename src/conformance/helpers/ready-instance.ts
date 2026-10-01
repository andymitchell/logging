import type { ILogStorage } from "../../log-storage/types.ts";
import type { ImplLogStorageHarness } from "../harness-types.ts";


/**
 * A store whose construction clean-up has finished, because its first read has been answered.
 *
 * A test that writes underneath a store "after it started" gets the store this way, so the write cannot race
 * the store's own clean-up (which would upgrade or remove the records before the test looked at them).
 */
export async function readyInstance(harness: ImplLogStorageHarness): Promise<ILogStorage> {
    const store = await harness.instance();
    await store.get();
    return store;
}
