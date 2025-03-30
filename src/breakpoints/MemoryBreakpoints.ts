import type { WhereFilterDefinition } from "@andyrmitchell/objects";
import type { AcceptLogEntry } from "../raw-storage/types.ts";
import { uuidV4 } from "@andyrmitchell/utils/uid";
import {  type Breakpoint, type BreakpointCallback, type IBreakpoints } from "./types.ts";
import { BaseBreakpoints } from "./BaseBreakpoints.ts";



/**
 * Callback to a breakpoint function when matching log entries are added 
 */
export class MemoryBreakpoints extends BaseBreakpoints implements IBreakpoints {

    protected breakpoints:Record<string, Breakpoint> = {};
    

    

    constructor(breakpointCallback?:BreakpointCallback) {

        super(breakpointCallback);


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

