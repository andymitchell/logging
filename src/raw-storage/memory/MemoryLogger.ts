import type { LoggerOptions } from "../../types.ts";
import { BaseLogger } from "../BaseLogger.ts";
import type { LogEntry, IRawLogger } from "../types.ts";



export class MemoryLogger extends BaseLogger implements IRawLogger {

    #log:LogEntry[]
    
    

    constructor(dbNamespace:string, options?: LoggerOptions) {
        super(dbNamespace, options);

        this.#log = [];
        
    }



    protected override async commitEntry(logEntry: LogEntry): Promise<void> {
        this.#log.push(logEntry);
        
    }


    public override async getAll(): Promise<LogEntry[]> {
        return JSON.parse(JSON.stringify(this.#log));
    }
}
