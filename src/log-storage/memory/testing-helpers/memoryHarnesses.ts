import type { LogEntry, LogStorageOptions } from "../../types.ts";
import type { ImplLogStorageHarness, LogStorageHarnessFactory } from "../../../conformance/harness-types.ts";
import { RawMemoryLogStorage } from "./RawMemoryLogStorage.ts";
import { SharedMemoryLogStorage, type SharedMemorySubstrate } from "./SharedMemoryLogStorage.ts";


/**
 * The conformance harness factory for a memory store: one store per substrate, which it owns for its lifetime.
 *
 * @param create Builds the store. Defaults to a plain {@link RawMemoryLogStorage}; a calibration decoy passes
 * a subclass that breaks one rule.
 */
export function privateMemoryHarnessFactory(
    create: (namespace: string, options?: LogStorageOptions) => RawMemoryLogStorage = (namespace, options) => new RawMemoryLogStorage(namespace, options),
): LogStorageHarnessFactory {
    return async ({ namespace, options }) => {
        const store = create(namespace, options);
        return {
            capabilities: { substrate: { mode: 'private' }, migration: { mode: 'migrates' } },
            instance: async () => store,
            raw: {
                readAll: async () => store.readRaw(),
                writeAll: async records => { store.writeRaw(records); },
            },
            dispose: async () => {},
        };
    };
}


/**
 * The conformance harness factory for memory stores over one shared substrate: every `instance()` is a new
 * store over the same records, as every `new IDBLogStorage(name)` is over the same database.
 *
 * @param create Builds each store. Defaults to a plain {@link SharedMemoryLogStorage}; a calibration decoy
 * passes a subclass that breaks one rule.
 */
export function sharedMemoryHarnessFactory(
    create: (namespace: string, substrate: SharedMemorySubstrate, options?: LogStorageOptions) => SharedMemoryLogStorage = (namespace, substrate, options) => new SharedMemoryLogStorage(namespace, substrate, options),
): LogStorageHarnessFactory {
    return async ({ namespace, options }): Promise<ImplLogStorageHarness> => {
        const substrate: SharedMemorySubstrate = { records: [] };
        return {
            capabilities: { substrate: { mode: 'shared' }, migration: { mode: 'migrates' } },
            instance: async () => create(namespace, substrate, options),
            raw: {
                readAll: async () => structuredClone<unknown[]>(substrate.records),
                writeAll: async records => {
                    // The backchannel deliberately puts non-entries on the substrate, to prove the store's doors.
                    substrate.records = [...substrate.records, ...(structuredClone(records) as LogEntry[])];
                },
            },
            dispose: async () => {},
        };
    };
}
