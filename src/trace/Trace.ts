import type { IRawLogger } from "./raw-storage/types.ts";
import { Span } from "./Span.ts";
import type { ISpan, MinimumContext } from "./types.ts";


/**
 * The top level of a trace.
 * 
 * An alias for Span without parentId in the constructor
 */
export class Trace<T extends MinimumContext = MinimumContext> extends Span<T> implements ISpan<T> {

    

    constructor(storage:IRawLogger<any>) {
        super(storage);
        
    }

}