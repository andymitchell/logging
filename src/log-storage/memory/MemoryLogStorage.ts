import { matchJavascriptObject, type WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { LogStorageOptions } from "../types.ts";
import { BaseLogStorage } from "../BaseLogStorage.ts";
import type { LogEntry, ILogStorage } from "../types.ts";
import createMaxAgeTest from "../createMaxAgeTest.ts";
import type { LoggingResult } from "../../failures/types.ts";
import { ok } from "../../failures/results.ts";



export class MemoryLogStorage extends BaseLogStorage implements ILogStorage {

    private _log:LogEntry[]

    protected override readonly storeName: string = 'MemoryLogStorage';

    

    constructor(dbNamespace:string, options?: LogStorageOptions) {
        super(dbNamespace, options);

        this._log = [];
        
        this.clearOldEntries();
    }

    

    protected override async commitEntry(logEntry: LogEntry): Promise<LoggingResult> {
        this._log.push(logEntry);
        return ok();
    }

    protected override async clearOldEntries(): Promise<void> {
        const filter = createMaxAgeTest(this.maxAge);
        this._log = this._log.filter(filter)
    }


    public override async reset(entries?: LogEntry[]):Promise<void> {
        this._log = entries ?? [];
    }

    public override async get<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<T[]> {
        let entries = structuredClone(this._log) as T[];
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
