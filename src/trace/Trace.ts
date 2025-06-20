
import type { ILogStorage } from "../index-browser.ts";
import { Span } from "./Span.ts";
import type { ISpan } from "./types.ts";



/**
 * The top level of a trace.
 * 
 * An alias for Span without parentId in the constructor
 */
export class Trace extends Span implements ISpan {

    

    constructor(storage:ILogStorage, name?: string, context?: any) {
        super(storage, undefined, name, context);
        
    }

}