
import type { LoggerOptions } from "../../../types.ts";
import type { LogEntry, IRawLogger } from "../../types.ts";
import { WebhookLogger } from "../WebhookLogger.ts";
import type { FetchEmitter } from "./FetchEmitter.ts";
import createMaxAgeTest from "../../createMaxAgeTest.ts";
import { matchJavascriptObject, type WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";


/**
 * This captures the logs sent via fetch, so they can be 'get'/'reset'/etc.
 */
export class WebhookLoggerForTesting extends WebhookLogger implements IRawLogger {


    #log:LogEntry[] = [];

    constructor(dbNamespace: string, postUrl: string, fetchEmitter:FetchEmitter, options?: LoggerOptions) {
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

    public override async get(filter?: WhereFilterDefinition<LogEntry>, fullTextFilter?: string): Promise<LogEntry[]> {
        let entries = structuredClone(this.#log) as LogEntry[];
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
