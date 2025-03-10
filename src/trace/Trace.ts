
import type { IRawLogger } from "../index-browser.ts";
import type { MinimumContext } from "../types.ts";
import { Span } from "./Span.ts";
import type { ISpan } from "./types.ts";



/**
 * The top level of a trace.
 * 
 * An alias for Span without parentId in the constructor
 */
export class Trace<T extends MinimumContext = MinimumContext> extends Span<T> implements ISpan<T> {

    

    constructor(storage:IRawLogger<any>, name?: string, context?: T) {
        super(storage, undefined, name, context);
        
    }

}