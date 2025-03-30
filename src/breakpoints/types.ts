import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter"
import type { AcceptLogEntry } from "../raw-storage/types.ts"



export interface IBreakpointsPublic {
    addBreakpoint(filter:WhereFilterDefinition<AcceptLogEntry>):Promise<{id:string}>

    removeBreakpoint(id: string):Promise<void>

    listBreakpoints():Promise<Breakpoint[]>

    /**
     * Specify the function to call on globalThis when the breakpoint is hit. 
     * 
     * It was tempting to just use 'debugger', but OWASP security scanners consider such code in production to be a risk. 
     * 
     * Instead, in your dev-tools/inspector, add a line like `globalThis._loggerBreakpointCallback = (entry) => debugger;`
     */
    setHandler(callback: BreakpointCallback): void;
}

export interface IBreakpoints extends IBreakpointsPublic {

    test(entry:Partial<AcceptLogEntry>):Promise<void> 

}




type GlobalWithBreakpoint = typeof globalThis & {
    _loggerBreakpoints: Record<string, {
        addBreakpoint: (filter:WhereFilterDefinition) => Promise<void>,
        removeBreakpoint: (id?: string) => Promise<void>,
        listBreakpoints: () => Promise<void>,
        setHandler:(handler:BreakpointCallback) => void,
    }>,
    _loggerBreakpointCallbacks: Record<string, BreakpointCallback>
}
export const globalThisWithBreakpointFunction = globalThis as GlobalWithBreakpoint;

export type BreakpointCallback = (entry:Partial<AcceptLogEntry>) => void;
export type Breakpoint = {id: string, filter: WhereFilterDefinition};