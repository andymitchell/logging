import type { LoggerOptions } from "../../types.ts";
import { BaseLogger } from "../BaseLogger.js";
import type { IRawLogger, LogEntry } from "../types.ts";




export class IDBLogger extends BaseLogger implements IRawLogger {
    #dbPromise: Promise<IDBDatabase>;
    

    constructor(dbNamespace:string, options?: LoggerOptions) {
        super(dbNamespace, options);

        this.#dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(`${dbNamespace}_auth_log`, 1);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('logs')) {
                    const store = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('level', 'level', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                resolve((event.target as IDBOpenDBRequest).result);
                this.#cleanupOldLogs();
            };

            request.onerror = (_event) => {
                reject(new Error('Failed to open IndexedDB.'));
            };
        })
    }


    async #cleanupOldLogs() {
        const db = await this.#dbPromise;
        const transaction = db.transaction('logs', 'readwrite');
        const store = transaction.objectStore('logs');
        const index = store.index('timestamp');
        const now = Date.now();
        const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = now - (14 * 24 * 60 * 60 * 1000);
        let recentError = false;

        index.openCursor().onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                const log = cursor.value;
                if (log.level === 'error' && log.timestamp > threeDaysAgo) {
                    recentError = true;
                }
                if ((recentError && log.timestamp < fourteenDaysAgo) || (!recentError && log.timestamp < threeDaysAgo)) {
                    cursor.delete();
                }
                cursor.continue();
            }
        };
    }


    protected override async commitEntry(logEntry: LogEntry): Promise<void> {
        const db = await this.#dbPromise;
        const transaction = db.transaction('logs', 'readwrite');
        const request = transaction.objectStore('logs').add(logEntry);
        return new Promise<void>((resolve, reject) => {
            request.onsuccess = (() => {
                resolve()
            })
            request.onerror = ((event) => {
                reject(event)
            })
        });
        
    }


    public override async getAll(): Promise<LogEntry[]> {
        return new Promise(async (resolve, reject) => {
            const db = await this.#dbPromise;
            const transaction = db.transaction('logs', 'readonly');
            const store = transaction.objectStore('logs');
            const request = store.getAll();

            request.onsuccess = (event) => {
                resolve((event.target as IDBRequest).result);
            };

            request.onerror = (event) => {
                reject(event);
            };
        });
    }
}
