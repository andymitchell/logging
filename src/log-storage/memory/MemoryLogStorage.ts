import { matchJavascriptObject, type WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { LogStorageOptions } from "../types.ts";
import { BaseLogStorage } from "../BaseLogStorage.ts";
import type { LogEntry, ILogStorage } from "../types.ts";
import createMaxAgeTest from "../createMaxAgeTest.ts";
import type { LogReadResult, LoggingResult } from "../../failures/types.ts";
import { ok } from "../../failures/results.ts";
import { decideCleanUp, isCurrentLogEntry } from "../format/index.ts";



export class MemoryLogStorage extends BaseLogStorage implements ILogStorage {

    /**
     * The substrate. It holds only current entries, because `add` and `reset` refuse anything else and clean-up
     * migrates or removes what it cannot read. Reads still let through only current entries, and clean-up still
     * migrates or removes, so the store keeps that promise even when a subclass writes here directly.
     */
    protected _log:LogEntry[]

    protected override readonly storeName: string = 'MemoryLogStorage';



    constructor(dbNamespace:string, options?: LogStorageOptions) {
        super(dbNamespace, options);

        this._log = [];
    }



    protected override async commitEntry(logEntry: LogEntry): Promise<LoggingResult> {
        this._log.push(logEntry);
        return ok();
    }

    /**
     * Clean up the substrate in one pass: upgrade entries from older formats, remove records the store cannot
     * read, and remove entries older than `max_age` (dec-clean-up-migrates-or-purges). The new substrate is
     * built in full before it replaces the old one, so a `max_age` that cannot be applied fails the call and
     * changes nothing.
     */
    protected override async clearOldEntries(): Promise<LoggingResult> {
        const isWithinMaxAge = createMaxAgeTest(this.maxAge);
        const next = this._log.flatMap(record => {
            const decision = decideCleanUp(record, isWithinMaxAge);
            return decision.action === 'keep' ? [record] : decision.action === 'replace' ? [decision.entry] : [];
        });
        this._log = next;
        return ok();
    }


    protected override async resetEntries(entries?: LogEntry[]): Promise<LoggingResult> {
        // Copied, so a later write never appends to the caller's array.
        this._log = [...(entries ?? [])];
        return ok();
    }

    protected override async queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
        // Only current entries leave the store (dec-read-skips-non-current-records). Nothing is removed here: a
        // read never changes the substrate.
        let entries = structuredClone(this._log.filter(isCurrentLogEntry)) as T[];
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
