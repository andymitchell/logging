
import { globalThisWithBreakpointFunction,  type BreakpointCallback,  type IBreakpoints } from "./types.ts";

/**
 * Call this function to expose an IBreakpoints in the console, where it can be controlled 
 * @param id A unique name for accessing this IBreakpoints. Probably your app name.
 * @param breakpoints 
 */
export function initiateBreakpointCommandsInDevTools(id: string, breakpoints:IBreakpoints) {
    

    const isValidIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(id);

    if( !globalThisWithBreakpointFunction._loggerBreakpoints ) globalThisWithBreakpointFunction._loggerBreakpoints = {};
    if( !globalThisWithBreakpointFunction._loggerBreakpointCallbacks ) globalThisWithBreakpointFunction._loggerBreakpointCallbacks = {};

    globalThisWithBreakpointFunction._loggerBreakpoints[id] = {
        async addBreakpoint(filter) {
            // TODO Check schema and error
            const result = await breakpoints.addBreakpoint(filter);
            console.log(`Created breakpoint with id ${result.id}`);
        },
        async removeBreakpoint(id?) {
            if( !id ) {
                // List them in a prompt 
                const items = await breakpoints.listBreakpoints();
                let text = `Remove which?\n\n`+items.map((x, index) => `${index+1}) ${JSON.stringify(x.filter)}`);
                const choice = prompt(text);
                if( !choice ) {
                    console.log("Cancelled");
                    return;
                }
                const index = Number(choice);
                if( isNaN(index) ) {
                    console.log("Cancelled - please enter a number");
                }
                id = items[index-1]?.id;
            }
            if( !id ) return;

            breakpoints.removeBreakpoint(id);
        },
        async listBreakpoints() {
            const items = await breakpoints.listBreakpoints();
            let text = `Breakpoints:\n\n`+items.map((x) => `[${x.id}] ${JSON.stringify(x.filter)}`).join('\n');
            if( items.length===0 ) text += "None";
            console.log(text);
        },

        async setHandler(listener:BreakpointCallback) {
            breakpoints.setHandler(listener);
        },

        
    }

    const commandsIdentifier = isValidIdentifier? `_loggerBreakpoints.${id}` : `_loggerBreakpoints['${id}']`;
    console.log(`Access Logger Breakpoints for ${id} at:\n${commandsIdentifier}`)

    const breakpointCallbackDef = `${commandsIdentifier}.setHandler((entry) => {debugger});`
    if( !globalThisWithBreakpointFunction._loggerBreakpointCallbacks[id] ) {
        globalThisWithBreakpointFunction._loggerBreakpointCallbacks[id] = () => {
            const message = `Replace me with a function to handle the break, e.g. ${breakpointCallbackDef}`;
            if( console ) {
                console.warn(message);
            } else {
                throw new Error(message);
            }
        }

        console.log(`Don't forget to create a breakpoint handler, e.g.\n${breakpointCallbackDef}`)
    }
    breakpoints.setHandler((entry) => {
        globalThisWithBreakpointFunction._loggerBreakpointCallbacks[id]!(entry);
    })

    
    // TODO Return sufficient info for testing, e.g. callback function names 
    return {

    }
}