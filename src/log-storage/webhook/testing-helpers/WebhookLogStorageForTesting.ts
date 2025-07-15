
import type { LogStorageOptions } from "../../types.ts";
import type { LogEntry, ILogStorage } from "../../types.ts";
import { WebhookLogStorage } from "../WebhookLogStorage.ts";
import type { FetchEmitter } from "./FetchEmitter.ts";
import createMaxAgeTest from "../../createMaxAgeTest.ts";
import { matchJavascriptObject, type WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";


/**
 * This captures the logs sent via fetch, so they can be 'get'/'reset'/etc.
 */
export class WebhookLogStorageForTesting extends WebhookLogStorage implements ILogStorage {


    #log:LogEntry[] = [];

    constructor(dbNamespace: string, postUrl: string, fetchEmitter:FetchEmitter, options?: LogStorageOptions) {
        super(dbNamespace, postUrl, options);

        this.clearOldEntries();

        fetchEmitter.on('post', payload => {
            if( payload.body.instanceId===this.instanceId ) {
                // Log it
                payload.body.entries.forEach(logEntry => {
                    this.#log.push(logEntry);
                })
                
            }
        })

    }

    protected override async clearOldEntries(): Promise<void> {
        const filter = createMaxAgeTest(this.maxAge);
        this.#log = this.#log.filter(filter)
    }

    
    public override async reset(entries?: LogEntry[]):Promise<void> {
        this.#log = entries ?? [];
    }

    public override async get<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<T[]> {
        let entries = structuredClone(this.#log) as T[];
        entries = filter? entries.filter(x => matchJavascriptObject(x, filter)) : entries;

        if( fullTextFilter ) {
            entries = entries.filter(x => {
                const json = JSON.stringify(x);
                return json.includes(fullTextFilter);
            })
        }

        return entries;
    }


}
