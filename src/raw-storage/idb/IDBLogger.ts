import {  matchJavascriptObject, type WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { LoggerOptions, MinimumContext } from "../../types.ts";
import { BaseLogger } from "../BaseLogger.js";
import type { IRawLogger, LogEntry } from "../types.ts";
import createMaxAgeTest from "../createMaxAgeTest.ts";




export class IDBLogger<T extends MinimumContext = MinimumContext> extends BaseLogger<T> implements IRawLogger<T> {
    #dbPromise: Promise<IDBDatabase>;
    

    constructor(dbNamespace:string, options?: LoggerOptions) {
        super(dbNamespace, options);

        this.#dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(`${dbNamespace}_logger`, 1);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('logs')) {
                    const store = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('level', 'level', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                this.#clearOldEntriesUsingDb(db);
                resolve(db);
            };

            request.onerror = (_event) => {
                reject(new Error('Failed to open IndexedDB.'));
            };
        })
    }

    async #clearOldEntriesUsingDb(db:IDBDatabase): Promise<void> {
        const filter = createMaxAgeTest(this.maxAge);
        

        const transaction = db.transaction('logs', 'readwrite');
        const store = transaction.objectStore('logs');
        const index = store.index('timestamp');

        

        index.openCursor().onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                const log = cursor.value as LogEntry;
                if( filter(log) ) {
                    cursor.continue();
                } else {
                    cursor.delete();
                }
                
            }
        };
    }

    protected override async clearOldEntries(): Promise<void> {
        

        const db = await this.#dbPromise;
        this.#clearOldEntriesUsingDb(db);
        
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


    public override async get(filter?: WhereFilterDefinition<LogEntry<T>>, fullTextFilter?: string): Promise<LogEntry<T>[]> {
        return new Promise(async (resolve, reject) => {
            const db = await this.#dbPromise;
            const transaction = db.transaction('logs', 'readonly');
            const store = transaction.objectStore('logs');
            const request = store.getAll();

            request.onsuccess = (event) => {
                let entries = (event.target as IDBRequest).result as LogEntry<T>[];
                // TODO Filter IndexedDb properly
                entries = filter? entries.filter(x => matchJavascriptObject(x, filter)) : entries;
                if( fullTextFilter ) {
                    entries = entries.filter(x => {
                        const json = JSON.stringify(x);
                        return json.includes(fullTextFilter);
                    })
                }
                resolve(entries);
            };

            request.onerror = (event) => {
                reject(event);
            };
        });
    }
}
