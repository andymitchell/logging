import type { LogEntry, LogStorageOptions } from "../../types.ts";
import { MemoryLogStorage } from "../MemoryLogStorage.ts";


/** The records several {@link SharedMemoryLogStorage} instances sit over. Replaced, never edited, by clean-up and reset. */
export type SharedMemorySubstrate = { records: LogEntry[] };


/**
 * A memory store over a substrate that several instances share, for tests: a stand-in for IndexedDB that runs
 * in-process, so the rules for stores over a shared substrate can be exercised without a database.
 *
 * Like a store over a durable substrate, it cleans up as it is constructed, before it can answer any call.
 *
 * @example
 * const substrate: SharedMemorySubstrate = { records: [] };
 * const app = new SharedMemoryLogStorage('my-app', substrate);
 * const viewer = new SharedMemoryLogStorage('my-app', substrate);
 * await app.add({ type: 'info', message: 'hello' });
 * await viewer.get(); // the entry `app` added
 */
export class SharedMemoryLogStorage extends MemoryLogStorage {

    constructor(dbNamespace: string, substrate: SharedMemorySubstrate, options?: LogStorageOptions) {
        super(dbNamespace, options);
        // `_log` is a field of each instance, so it is redefined on this instance to read and replace the shared
        // records: every write, reset and clean-up by any instance lands in the one substrate.
        Object.defineProperty(this, '_log', {
            get: () => substrate.records,
            set: (records: LogEntry[]) => { substrate.records = records; },
        });
        this.startUpCleanUp();
    }

    /**
     * Clean up the substrate as the store opens. It runs to completion before the constructor returns, and so
     * before any call is answered (dec-start-up-clean-up-before-first-answer). No call asked for it, so its
     * failure is ignored, as IndexedDB's is.
     */
    protected startUpCleanUp(): void {
        this.clearOldEntries().catch(() => {});
    }
}
