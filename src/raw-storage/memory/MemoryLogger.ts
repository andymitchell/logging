import { matchJavascriptObject, type WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";
import type { LoggerOptions, MinimumContext } from "../../types.ts";
import { BaseLogger } from "../BaseLogger.ts";
import type { LogEntry, IRawLogger } from "../types.ts";



export class MemoryLogger<T extends MinimumContext = MinimumContext> extends BaseLogger<T> implements IRawLogger<T> {

    #log:LogEntry[]
    
    

    constructor(dbNamespace:string, options?: LoggerOptions) {
        super(dbNamespace, options);

        this.#log = [];
        
        this.clearOldEntries();
    }

    protected override async clearOldEntries(): Promise<void> {
        if( this.maxAgeMs!==Infinity ) {
            const afterTs = Date.now()-this.maxAgeMs;
            this.#log = this.#log.filter(x => x.timestamp>=afterTs);
        }
    }


    protected override async commitEntry(logEntry: LogEntry): Promise<void> {
        this.#log.push(logEntry);
        
    }


    public override async get(filter?: WhereFilterDefinition<LogEntry<T>>): Promise<LogEntry<T>[]> {
        const entries = JSON.parse(JSON.stringify(this.#log)) as LogEntry<T>[];
        return filter? entries.filter(x => matchJavascriptObject(x, filter)) : entries;
    }
}
