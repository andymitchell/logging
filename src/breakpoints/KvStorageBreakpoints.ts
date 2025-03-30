import type { WhereFilterDefinition } from "@andyrmitchell/objects";
import type { AcceptLogEntry } from "../raw-storage/types.ts";
import { uuidV4 } from "@andyrmitchell/utils/uid";
import {  type Breakpoint, type BreakpointCallback, type IBreakpoints } from "./types.ts";
import { BaseBreakpoints } from "./BaseBreakpoints.ts";
import { ChromeStorage, TypedStorage, type IRawStorage } from "@andyrmitchell/utils/kv-storage";



/**
 * Callback to a breakpoint function when matching log entries are added 
 */
export class KvStorageBreakpoints extends BaseBreakpoints implements IBreakpoints {

    protected breakpoints:TypedStorage<Breakpoint>;
    

    

    constructor(namespace:string, breakpointCallback?:BreakpointCallback, rawStorage?:IRawStorage) {
        
        super(breakpointCallback);

        this.breakpoints = new TypedStorage(rawStorage ?? new ChromeStorage(), undefined, namespace);


    }

    override async addBreakpoint(filter:WhereFilterDefinition<AcceptLogEntry>):Promise<{id:string}> {
        const id = uuidV4();
        this.breakpoints.set(id, {id, filter});
        return {id};
    }

    override async removeBreakpoint(id: string):Promise<void> {
        return this.breakpoints.remove(id);
        
    }

    override async listBreakpoints():Promise<Breakpoint[]> {
        const result = await this.breakpoints.getAll();
        return Object.values(result);
    }


}

