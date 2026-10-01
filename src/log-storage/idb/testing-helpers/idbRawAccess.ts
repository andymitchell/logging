/**
 * A second connection to an IndexedDB store's database, for tests. It reads and writes rows directly,
 * bypassing the store's `add`, `get`, masking and stamping, so a test can place records the store's own doors
 * would refuse and then observe what the store does with them.
 */
export type IdbRawAccess = {
    /** Every row's record, minus the key IndexedDB assigned it (`id`), so it compares equal to what was written. Untrusted. */
    readAll(): Promise<unknown[]>;
    /** Every row's record, by the key IndexedDB assigned it. Untrusted. */
    readKeyed(): Promise<Map<IDBValidKey, unknown>>;
    /** Add each record as a new row, in one transaction. Resolves with the key each row was given, in order. */
    writeAll(records: readonly Record<string, unknown>[]): Promise<IDBValidKey[]>;
    /** Close the connection, if it was opened. */
    close(): void;
};


/**
 * Open a raw connection to the database of `new IDBLogStorage(dbNamespace)`.
 *
 * The connection opens on first use, through whichever `indexedDB` is global at that moment (a test may swap
 * in a fresh factory). It opens at the database's current version, so the database and its `logs` store must
 * already exist: await a read on a store over it first. Opening a database that does not exist yet would
 * create it empty, and the store's own open would then never create its `logs` store.
 *
 * @example
 * await new IDBLogStorage('my-app').get();
 * const raw = idbRawAccess('my-app');
 * onTestFinished(raw.close);
 * await raw.writeAll([{ nonsense: true }]);
 */
export function idbRawAccess(dbNamespace: string): IdbRawAccess {
    let opening: Promise<IDBDatabase> | undefined;
    const db = () => opening ??= requested(indexedDB.open(`${dbNamespace}_logger`));

    const readKeyed = async (): Promise<Map<IDBValidKey, unknown>> => {
        const logs = (await db()).transaction(LOGS, 'readonly').objectStore(LOGS);
        const [keys, records] = await Promise.all([requested(logs.getAllKeys()), requested(logs.getAll())]);
        return new Map(keys.map((key, index) => [key, records[index]]));
    };

    return {
        async readAll() {
            return [...(await readKeyed()).values()].map(withoutRowKey);
        },
        readKeyed,
        async writeAll(records) {
            const transaction = (await db()).transaction(LOGS, 'readwrite');
            const logs = transaction.objectStore(LOGS);
            const [keys] = await Promise.all([Promise.all(records.map(record => requested(logs.add(record)))), committed(transaction)]);
            return keys;
        },
        close() {
            opening?.then(connection => connection.close(), () => {});
        },
    };
}


const LOGS = 'logs';

/** The record without the `id` IndexedDB assigned it. Anything that is not an object is returned as it is. */
function withoutRowKey(record: unknown): unknown {
    if( typeof record !== 'object' || record === null ) return record;
    return Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'id'));
}

/** What an IndexedDB request produced, once it has. */
function requested<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Resolves once `transaction` has committed. */
function committed(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
    });
}
