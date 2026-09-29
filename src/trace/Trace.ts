
import type { ILogStorage } from "../index-browser.ts";
import type { LogCallMaskingOptions } from "../log-storage/types.ts";
import { Span } from "./Span.ts";
import type { ISpan } from "./types.ts";



/**
 * The top level of a trace.
 *
 * An alias for Span without parentId in the constructor
 */
export class Trace extends Span implements ISpan {



    /**
     * Starts a trace and records its `span_start` entry in `storage`.
     *
     * @param storage The storage that receives the trace's entries.
     * @param name An optional name written on the `span_start` entry.
     * @param context Optional context written on the `span_start` entry.
     * @param options Optional masking directives that apply only to the start entry's context.
     * @throws TypeError if `storage` lacks `onFailure` or `reportInternalFailure` (a store that does not
     * implement {@link ILogStorage}). A store that fails to record the start does not make this throw: the
     * failure is told to the store's failure listeners.
     */
    constructor(storage:ILogStorage, name?: string, context?: any, options?: LogCallMaskingOptions) {
        super(storage, undefined, name, context, options);

    }

}