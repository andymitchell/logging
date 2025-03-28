import type { Ref } from "react"
import { isEventLogEntry, type LogEntry } from "../../raw-storage/types.ts"
import { isEventLogEntrySpanStart, type SpanMeta } from "../../trace/types.ts"

export type BaseComponentTypes = {
    

    /**
     * Internal access to the top level element
     */
    ref?:Ref<HTMLDivElement>,

    /**
     * Style the top level element
     */
    style?: React.CSSProperties,

    /**
     * Give a custom class name to the top level element. 
     * 
     * FYI the major elements use a 'data-container' property that CSS can target 
     */
    className?: string
}


export type TLogBody = {
    message: string,
    timestamp: number,
}

export type TLog = {
    type: 'log',
    id: string,
    body: TLogBody,
    
}

export type TSpan = {
    type: 'span',
    id: string,
    /**
     * Logs are nested in a waterfall. The depth represents their indentation level.
     */
    depth: number,
    body: TLogBody,
    children: Array<TLog | TSpan>
}


export function convertLogSpanEntryToBody(entry:LogEntry<any, SpanMeta>):TLogBody {
    if( isEventLogEntry(entry) && !isEventLogEntrySpanStart(entry) ) {
        return {
            message: "Unsupported. Do not pass in non-start events.",
            timestamp: entry.timestamp
        }
    } else {
        return {
            message: entry.message ?? '',
            timestamp: entry.timestamp
        }
    }
}



export function convertLogToTree(logEntries: LogEntry<any, SpanMeta>[]): TSpan | undefined {
    if (logEntries.length === 0) return;

    logEntries = [...logEntries].sort((a, b) => a.ulid.localeCompare(b.ulid)); // They have to be sorted for the nesting to work

    const lookup: Record<string, TSpan> = {};
    let topSpan: TSpan | undefined;

    for (const entry of logEntries) {
        const meta = entry.meta!;

        // Get the span this entry belongs to
        let span: TSpan | undefined = lookup[meta.span.id];
        if (isEventLogEntry(entry)) {
            if( isEventLogEntrySpanStart(entry) ) {
                if (span) throw new Error("Span should not be created more than once");

                let parent: TSpan | undefined;
                if (meta.span.parent_id) {
                    parent = lookup[meta.span.parent_id];

                    if (!parent) {
                        throw new Error("There should always be a parent. Have logs been sorted into a non ascending timestamp order?")
                    }
                }

                span = {
                    type: 'span',
                    id: meta.span.id,
                    depth: parent ? parent.depth + 1 : 0,
                    body: convertLogSpanEntryToBody(entry),
                    children: []
                }
                if (parent) parent.children.push(span);
                lookup[meta.span.id] = span;
                if (!topSpan) topSpan = span;
            }
        } else {
            if (!span) throw new Error("There should have been a span created by span_start. Are logs in order?");

            // Push this Log to the span
            span.children.push({
                type: 'log',
                id: entry.ulid,
                body: convertLogSpanEntryToBody(entry)
            })
        


        }

    }

    return topSpan;
}