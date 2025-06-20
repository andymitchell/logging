import { matchJavascriptObject, type WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { LoggerOptions } from "../../types.ts";
import { BaseLogger } from "../BaseLogger.ts";
import type { LogEntry, IRawLogger } from "../types.ts";
import createMaxAgeTest from "../createMaxAgeTest.ts";


export class MemoryLogger extends BaseLogger implements IRawLogger {

    #log:LogEntry[]
    
    

    constructor(dbNamespace:string, options?: LoggerOptions) {
        super(dbNamespace, options);

        this.#log = [];
        
        this.clearOldEntries();
    }

    

    protected override async commitEntry(logEntry: LogEntry): Promise<void> {
        this.#log.push(logEntry);
        
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
