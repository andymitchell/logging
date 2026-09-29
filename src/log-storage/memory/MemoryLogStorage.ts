import { matchJavascriptObject, type WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { LogStorageOptions } from "../types.ts";
import { BaseLogStorage } from "../BaseLogStorage.ts";
import type { LogEntry, ILogStorage } from "../types.ts";
import createMaxAgeTest from "../createMaxAgeTest.ts";
import type { LogReadResult, LoggingResult } from "../../failures/types.ts";
import { ok } from "../../failures/results.ts";



export class MemoryLogStorage extends BaseLogStorage implements ILogStorage {

    private _log:LogEntry[]

    protected override readonly storeName: string = 'MemoryLogStorage';



    constructor(dbNamespace:string, options?: LogStorageOptions) {
        super(dbNamespace, options);

        this._log = [];
    }



    protected override async commitEntry(logEntry: LogEntry): Promise<LoggingResult> {
        this._log.push(logEntry);
        return ok();
    }

    protected override async clearOldEntries(): Promise<LoggingResult> {
        const filter = createMaxAgeTest(this.maxAge);
        this._log = this._log.filter(filter);
        return ok();
    }


    protected override async resetEntries(entries?: LogEntry[]): Promise<LoggingResult> {
        // Copied, so a later write never appends to the caller's array.
        this._log = [...(entries ?? [])];
        return ok();
    }

    protected override async queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
        let entries = structuredClone(this._log) as T[];
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
