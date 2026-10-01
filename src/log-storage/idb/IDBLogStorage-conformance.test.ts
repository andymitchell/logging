import "fake-indexeddb/auto"; // Prevent any long-term IDB storage
import { IDBFactory } from "fake-indexeddb";
import { beforeEach } from 'vitest';
import { runLogStorageConformance } from "../../conformance/index.ts";
import { IDBLogStorage } from "./IDBLogStorage.ts";
import { idbRawAccess } from "./testing-helpers/idbRawAccess.ts";


beforeEach(() => {
    // Reset fake idb data
    indexedDB = new IDBFactory();
});


runLogStorageConformance(async ({ namespace, options }) => {
    // The database and its `logs` store must exist before raw access opens it: opening a database that does not
    // exist yet would create it empty, and a store's own open would then never create its `logs` store. A
    // throwaway store creates them.
    await new IDBLogStorage(namespace, options).get();
    const raw = idbRawAccess(namespace);
    return {
        capabilities: { substrate: { mode: 'shared' }, migration: { mode: 'migrates' } },
        // A new store over the same database on every call, not awaited, exactly as an app or a second tab builds one.
        instance: async () => new IDBLogStorage(namespace, options),
        raw: {
            readAll: () => raw.readAll(),
            writeAll: async records => { await raw.writeAll(records); },
        },
        // Closes the raw connection only. The fresh IDBFactory each test starts with discards the data.
        dispose: async () => { raw.close(); },
    };
});
