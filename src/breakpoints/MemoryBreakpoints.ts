import type { WhereFilterDefinition } from "@andyrmitchell/objects";
import type { AcceptLogEntry } from "../log-storage/types.ts";
import { uuidV4 } from "@andyrmitchell/utils/uid";
import {  type Breakpoint, type IBreakpoints } from "./types.ts";
import { BaseBreakpoints } from "./BaseBreakpoints.ts";



/**
 * Manage breakpoints that will callback to a handler when a filter is matched 
 */
export class MemoryBreakpoints extends BaseBreakpoints implements IBreakpoints {

    protected breakpoints:Record<string, Breakpoint> = {};
    
    constructor() {
        super();
    }

    override async addBreakpoint(filter:WhereFilterDefinition<AcceptLogEntry>):Promise<{id:string}> {
        const id = uuidV4();
        this.breakpoints[id] = {id, filter};
        return {id};
    }

    override async removeBreakpoint(id: string):Promise<void> {
        if( this.breakpoints[id] ) {
            delete this.breakpoints[id];
        }
    }

    override async listBreakpoints():Promise<Breakpoint[]> {
        return Object.values(this.breakpoints);
    }


}

