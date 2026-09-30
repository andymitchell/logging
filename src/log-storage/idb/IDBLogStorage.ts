import {  matchJavascriptObject, type WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { LogStorageOptions } from "../types.ts";
import { BaseLogStorage } from "../BaseLogStorage.ts";
import type { ILogStorage, LogEntry } from "../types.ts";
import createMaxAgeTest from "../createMaxAgeTest.ts";
import type { LogReadResult, LoggingFailure, LoggingOperation, LoggingResult } from "../../failures/types.ts";
import { ok } from "../../failures/results.ts";



/**
 * A log store that keeps entries in the browser's IndexedDB, so they survive a reload and can be read back
 * (e.g. by a trace viewer).
 *
 * The database, `<dbNamespace>_logger`, starts opening when the store is constructed, and every call waits
 * for it. Entries older than `max_age` are removed as soon as it opens, and again on `forceClearOldEntries`.
 * A write resolves once its entry is committed.
 *
 * Like every store it never throws or rejects. A failure carries the name of the exception IndexedDB raised
 * as `details`, e.g. `{ name: 'QuotaExceededError' }`, when it is one of the names IndexedDB defines; any other
 * name is left out, since it might quote logged data. A store whose database cannot be opened (it exists at a
 * newer version, or the runtime has no IndexedDB) answers every call with that failure, for as long as the
 * store lives.
 *
 * @example
 * const storage = new IDBLogStorage('my-app');
 * const result = await storage.add({ type: 'warn', message: 'slow' });
 * if (result.error) report(result.error);
 * // e.g. failures: [{ source: 'IDBLogStorage:my-app', operation: 'write', message: 'Could not record the entry.', details: { name: 'QuotaExceededError' } }]
 */
export class IDBLogStorage extends BaseLogStorage implements ILogStorage {
    /** The open database. Rejects with {@link CouldNotOpen}, for good, if it cannot be opened. */
    #db: Promise<IDBDatabase>;

    protected override readonly storeName: string = 'IDBLogStorage';


    /**
     * @param dbNamespace Names the database (`<dbNamespace>_logger`) and appears in the `source` of its failures.
     * @param options How entries are masked, how long they are kept, and more; see {@link LogStorageOptions}.
     */
    constructor(dbNamespace:string, options?: LogStorageOptions) {
        super(dbNamespace, options);

        this.#db = openDatabase(`${dbNamespace}_logger`, db => {
            // Queued before any call's transaction, so the first read already leaves out expired entries. No call
            // asked for this clean-up, so no result can carry its failure, and a failure is ignored.
            this.#clearOldEntriesIn(db).catch(() => {});
        });
        // Every call awaits the open and answers its failure. Until one does, this stops a failed open from also
        // being reported as an unhandled rejection.
        this.#db.catch(() => {});
    }

    /**
     * Describe a failure in IndexedDB's terms. This store's hooks reject with whatever IndexedDB raised, and
     * this turns it into the failure: a failed open says so, and an exception IndexedDB raised adds its `name`
     * as `details` (e.g. `{ name: 'QuotaExceededError' }`), which says what went wrong without quoting anything
     * that was logged. Only the names IndexedDB defines are reported.
     */
    protected override toFailure(operation: LoggingOperation, cause: unknown): LoggingFailure {
        const failure = super.toFailure(operation, cause);
        const opening = cause instanceof CouldNotOpen;
        const name = browserExceptionName(opening ? cause.reason : cause);
        return {
            ...failure,
            ...(opening ? { message: COULD_NOT_OPEN } : {}),
            ...(name === undefined ? {} : { details: { name } }),
        };
    }

    /**
     * Remove every entry older than its maximum age. The transaction is created before this returns, so it runs
     * before any transaction requested afterwards.
     */
    #clearOldEntriesIn(db: IDBDatabase): Promise<void> {
        return inTransaction(db, 'readwrite', (logs, guard) => {
            const isWithinMaxAge = createMaxAgeTest(this.maxAge);
            const cursorRequest = logs.index('timestamp').openCursor();
            cursorRequest.onsuccess = guard(() => {
                const cursor = cursorRequest.result;
                if( !cursor ) return;
                if( !isWithinMaxAge(cursor.value) ) cursor.delete();
                cursor.continue();
            });
        });
    }

    protected override async clearOldEntries(): Promise<LoggingResult> {
        await this.#clearOldEntriesIn(await this.#db);
        return ok();
    }


    protected override async commitEntry(logEntry: LogEntry): Promise<LoggingResult> {
        const db = await this.#db;
        await inTransaction(db, 'readwrite', logs => { logs.add(logEntry); });
        return ok();
    }

    protected override async resetEntries(entries: LogEntry[] = []):Promise<LoggingResult> {
        const db = await this.#db;
        // One transaction, so an entry the database refuses leaves every entry as it was.
        await inTransaction(db, 'readwrite', logs => {
            logs.clear();
            for( const entry of entries ) logs.add(entry);
        });
        return ok();
    }


    protected override async queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
        const db = await this.#db;
        const all = await inTransaction(db, 'readonly', logs => logs.getAll());

        // Filtered once the transaction has finished, so a filter that throws fails only this read.
        // TODO Filter IndexedDb properly
        let entries: T[] = all.result;
        entries = filter? entries.filter(x => matchJavascriptObject(x, filter)) : entries;
        if( fullTextFilter ) {
            entries = entries.filter(x => {
                const json = JSON.stringify(x);
                return json.includes(fullTextFilter);
            })
        }
        return { ok: true, entries };
    }
}


const LOGS = 'logs';

const COULD_NOT_OPEN = 'Could not open the IndexedDB database.';

/**
 * Why the database could not be opened. Every call made on the store rejects with it.
 */
class CouldNotOpen extends Error {
    constructor(readonly reason: unknown) {
        super(COULD_NOT_OPEN);
    }
}

/**
 * Open the database, creating its `logs` store the first time, and run `onOpen` with it before any call can
 * use it.
 *
 * @returns The database, or a rejection with {@link CouldNotOpen} holding the browser's reason.
 */
function openDatabase(name: string, onOpen: (db: IDBDatabase) => void): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.open(name, 1);
        } catch(cause) {
            // The runtime has no IndexedDB, or refuses this page one.
            reject(new CouldNotOpen(cause));
            return;
        }

        request.onupgradeneeded = () => {
            try {
                const db = request.result;
                if (!db.objectStoreNames.contains(LOGS)) {
                    const store = db.createObjectStore(LOGS, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('level', 'level', { unique: false });
                }
            } catch {
                // Abandon the upgrade, which fails the open (with an `AbortError`).
                abortQuietly(request.transaction);
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            try {
                onOpen(db);
            } catch {
                // The database is open and usable whatever `onOpen` did.
            }
            resolve(db);
        };

        request.onerror = () => {
            reject(new CouldNotOpen(request.error));
        };
    });
}

/**
 * Wrap a request's event handler so that a throw abandons the transaction (failing it with what was thrown)
 * rather than escaping to the browser.
 */
type Guard = (handler: () => void) => () => void;

/**
 * Run `work` in one transaction on the `logs` store, and resolve with what it returned once the transaction
 * has committed.
 *
 * The transaction is created before this returns, so it runs before any transaction requested afterwards.
 *
 * @param work Makes the transaction's requests. Wrap each request handler it sets with `guard`.
 * @returns What `work` returned (e.g. a request, whose `result` is then ready). Rejects with why the
 * transaction did not commit: what `work` or a guarded handler threw, else the transaction's own error (e.g. a
 * `ConstraintError` or `QuotaExceededError`).
 */
function inTransaction<R>(db: IDBDatabase, mode: IDBTransactionMode, work: (logs: IDBObjectStore, guard: Guard) => R): Promise<R> {
    return new Promise<R>((resolve, reject) => {
        const transaction = db.transaction(LOGS, mode);
        let thrown: { cause: unknown } | undefined;
        const abandon = (cause: unknown) => {
            thrown ??= { cause };
            abortQuietly(transaction);
        };
        const guard: Guard = handler => () => {
            try {
                handler();
            } catch(cause) {
                abandon(cause);
            }
        };

        let answer: R;
        transaction.oncomplete = () => resolve(answer);
        transaction.onabort = () => reject(thrown ? thrown.cause : (transaction.error ?? new Error('The IndexedDB transaction was aborted.')));
        try {
            answer = work(transaction.objectStore(LOGS), guard);
        } catch(cause) {
            abandon(cause);
        }
    });
}

/**
 * Abort `transaction`, unless it has already finished (in which case its own outcome stands).
 */
function abortQuietly(transaction: IDBTransaction | null): void {
    try {
        transaction?.abort();
    } catch {
        // Already committed or aborted.
    }
}

/**
 * The exception names the IndexedDB standard gives the browser to raise, plus `SecurityError`, which a browser
 * raises when a page may not use storage.
 */
const INDEXEDDB_EXCEPTION_NAMES: ReadonlySet<string> = new Set([
    'AbortError', 'ConstraintError', 'DataCloneError', 'DataError', 'InvalidAccessError', 'InvalidStateError',
    'NotFoundError', 'QuotaExceededError', 'ReadOnlyError', 'SecurityError', 'SyntaxError',
    'TransactionInactiveError', 'UnknownError', 'VersionError',
]);

/**
 * The name of an exception IndexedDB raised (e.g. `VersionError`), taken only from the names IndexedDB defines.
 * Nothing for any other value: app code can construct a `DOMException` with any name (even an email address),
 * so a name outside that list might quote anything.
 */
function browserExceptionName(cause: unknown): string | undefined {
    if( typeof DOMException !== 'function' || !(cause instanceof DOMException) ) return undefined;
    return INDEXEDDB_EXCEPTION_NAMES.has(cause.name) ? cause.name : undefined;
}
