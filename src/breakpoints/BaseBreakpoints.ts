import type { WhereFilterDefinition } from "@andyrmitchell/objects";
import type { AcceptLogEntry } from "../raw-storage/types.ts";

import { matchJavascriptObject } from "@andyrmitchell/objects/where-filter";
import {  type Breakpoint, type BreakpointCallback, type IBreakpoints } from "./types.ts";



/**
 * Callback to a breakpoint function when matching log entries are added 
 */
export class BaseBreakpoints implements IBreakpoints {

    
    protected breakpointCallback?: BreakpointCallback;

    

    constructor() {


    }



    


    async addBreakpoint(filter:WhereFilterDefinition<AcceptLogEntry>):Promise<{id:string}> {
        throw new Error("Method not implemented");
    }

    async removeBreakpoint(id: string):Promise<void> {
        throw new Error("Method not implemented");
    }

    async listBreakpoints():Promise<Breakpoint[]> {
        throw new Error("Method not implemented");
    }

    async test(entry:Partial<AcceptLogEntry>):Promise<void> {
        if( !this.breakpointCallback ) return;

        let match = false;
        const breakpoints = await this.listBreakpoints();
        for( const breakpoint of breakpoints ) {
            const filter = breakpoint.filter;
            if( matchJavascriptObject(entry, filter) ) {
                match = true;
                break;
            }
        }

        if( match ) {
            this.breakpointCallback(entry);
        }
    }

    setHandler(callback: BreakpointCallback): void {
        this.breakpointCallback = callback;
    }

}

