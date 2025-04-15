import { matchJavascriptObject, type WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { LoggerOptions, MinimumContext } from "../../types.ts";
import { BaseLogger } from "../BaseLogger.ts";
import type { LogEntry, IRawLogger } from "../types.ts";
import createMaxAgeTest from "../createMaxAgeTest.ts";


export class MemoryLogger<T extends MinimumContext = MinimumContext> extends BaseLogger<T> implements IRawLogger<T> {

    #log:LogEntry[]
    
    

    constructor(dbNamespace:string, options?: LoggerOptions) {
        super(dbNamespace, options);

        this.#log = [];
        
        this.clearOldEntries();
    }

    protected override async clearOldEntries(): Promise<void> {
        const filter = createMaxAgeTest(this.maxAge);
        this.#log = this.#log.filter(filter)
    }


    protected override async commitEntry(logEntry: LogEntry): Promise<void> {
        this.#log.push(logEntry);
        
    }

    public override async reset(entries?: LogEntry<T>[]):Promise<void> {
        this.#log = entries ?? [];
    }

    public override async get(filter?: WhereFilterDefinition<LogEntry<T>>, fullTextFilter?: string): Promise<LogEntry<T>[]> {
        let entries = structuredClone(this.#log) as LogEntry<T>[];
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
