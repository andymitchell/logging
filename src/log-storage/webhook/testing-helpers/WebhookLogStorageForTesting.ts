import type { LogStorageOptions } from "../../types.ts";
import type { LogEntry, ILogStorage } from "../../types.ts";
import { WebhookLogStorage } from "../WebhookLogStorage.ts";
import type { FetchEmitter } from "./FetchEmitter.ts";
import createMaxAgeTest from "../../createMaxAgeTest.ts";
import { matchJavascriptObject, type WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { LogReadResult, LoggingResult } from "../../../failures/types.ts";
import { ok } from "../../../failures/results.ts";


/**
 * This captures the logs sent via fetch, so they can be 'get'/'reset'/etc.
 */
export class WebhookLogStorageForTesting extends WebhookLogStorage implements ILogStorage {


    #log:LogEntry[] = [];

    constructor(dbNamespace: string, postUrl: string, fetchEmitter:FetchEmitter, options?: LogStorageOptions) {
        super(dbNamespace, postUrl, options);

        fetchEmitter.on('post', payload => {
            if( payload.body.instanceId===this.instanceId ) {
                // Log it
                payload.body.entries.forEach(logEntry => {
                    this.#log.push(logEntry);
                })

            }
        })

    }

    protected override async clearOldEntries(): Promise<LoggingResult> {
        const filter = createMaxAgeTest(this.maxAge);
        this.#log = this.#log.filter(filter);
        return ok();
    }


    protected override async resetEntries(entries?: LogEntry[]): Promise<LoggingResult> {
        this.#log = [...(entries ?? [])];
        return ok();
    }

    protected override async queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
        let entries = structuredClone(this.#log) as T[];
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
