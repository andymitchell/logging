import type { LogEntry } from "../../types.ts";
import { MemoryLogStorage } from "../MemoryLogStorage.ts";


/**
 * A memory store with a backchannel to its substrate, for tests. It reads and writes the records under the
 * store directly, bypassing `add`, `get`, masking and stamping, so a test can place records the store's own
 * doors would refuse and then observe what the store does with them.
 *
 * @example
 * const storage = new RawMemoryLogStorage('my-app');
 * storage.writeRaw([{ nonsense: true }]);
 * await storage.get();     // { ok: true, entries: [] }
 * storage.readRaw();       // [{ nonsense: true }]: a read never deletes
 */
export class RawMemoryLogStorage extends MemoryLogStorage {

    /** Every record on the substrate, copied, exactly as held. Untrusted: narrow before use. */
    readRaw(): unknown[] {
        return structuredClone<unknown[]>(this._log);
    }

    /** Append copies of `records` to the substrate, whatever they are. */
    writeRaw(records: readonly Record<string, unknown>[]): void {
        // The one place a non-entry enters the substrate: the backchannel deliberately corrupts it to prove the
        // store's doors; production code never does.
        this._log = [...this._log, ...(structuredClone(records) as LogEntry[])];
    }
}
