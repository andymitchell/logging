import type { WhereFilterDefinition } from "@andyrmitchell/objects";
import type { AcceptLogEntry } from "../raw-storage/types.ts";
import { uuidV4 } from "@andyrmitchell/utils/uid";
import { matchJavascriptObject } from "@andyrmitchell/objects/where-filter";


/**
 * Specify the function to call on globalThis when the breakpoint is hit. 
 * 
 * It was tempting to just use 'debugger', but OWASP security scanners consider such code in production to be a risk. 
 * 
 * Instead, in your dev-tools/inspector, add a line like `globalThis._loggerBreakpointCallback = (entry) => debugger;`
 */
export const GLOBAL_BREAKPOINT_FUNCTION = '_loggerBreakpointCallback';
type GlobalWithBreakpoint = typeof globalThis & {
    [K in typeof GLOBAL_BREAKPOINT_FUNCTION]: (entry:Partial<AcceptLogEntry>) => void
}
export const globalThisWithBreakpointFunction = globalThis as GlobalWithBreakpoint;

/**
 * Callback to a breakpoint function when matching log entries are added 
 */
export class MemoryBreakpoints {

    protected breakpoints:Record<string, {filter: WhereFilterDefinition, id: string}> = {};

    constructor() {

        // Make sure the placeholder exists, to help the consumer understand what they need to do 
        this.globalBreakpointFunction();

    }

    protected globalBreakpointFunction():(entry:Partial<AcceptLogEntry>) => void {

        if( !globalThisWithBreakpointFunction[GLOBAL_BREAKPOINT_FUNCTION] ) {
            globalThisWithBreakpointFunction[GLOBAL_BREAKPOINT_FUNCTION] = () => {
                const message = `Replace me with a function to handle the break, e.g. globalThis.${GLOBAL_BREAKPOINT_FUNCTION} = (entry) => debugger;`;
                if( console ) {
                    console.warn(message);
                } else {
                    throw new Error(message);
                }
            }
        }

        if( typeof globalThisWithBreakpointFunction[GLOBAL_BREAKPOINT_FUNCTION]!=='function' ) {
            throw new Error(`Global Breakpoint Function (globalThis.${GLOBAL_BREAKPOINT_FUNCTION}) is not actually a function`)
        }

        return globalThisWithBreakpointFunction[GLOBAL_BREAKPOINT_FUNCTION]!;
    }

    addBreakpoint(filter:WhereFilterDefinition<AcceptLogEntry>):{id:string} {
        const id = uuidV4();
        this.breakpoints[id] = {id, filter};
        return {id};
    }

    removeBreakpoint(id: string):void {
        if( this.breakpoints[id] ) {
            delete this.breakpoints[id];
        }
    }

    test(entry:Partial<AcceptLogEntry>):void {
        let match = false;
        for( const key in this.breakpoints ) {
            const filter = this.breakpoints[key]!.filter;
            if( matchJavascriptObject(entry, filter) ) {
                match = true;
                break;
            }
        }

        if( match ) {
            const breakpointFunction = this.globalBreakpointFunction();
            breakpointFunction(entry);
        }
    }

}