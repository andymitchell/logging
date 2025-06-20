import { matchJavascriptObject } from "@andyrmitchell/objects/where-filter";
import type { MaxAge } from "../types.ts";
import type { LogEntry } from "./types.ts";

export default function createMaxAgeTest(maxAge:MaxAge):(entry:LogEntry) => boolean {
    if( !Array.isArray(maxAge) ) {
        throw new Error("MaxAge is expected to be an array");
    }

    const maxAgeAfters = maxAge.map(x => ({
        ...x, 
        afterTs: Date.now()-x.max_ms
    }))


    return (entry:LogEntry):boolean => {

        for(const maxAge of maxAgeAfters ) {
            if( maxAge.filter ) {
                if( matchJavascriptObject(entry, maxAge.filter) ) {
                    return entry.timestamp >= maxAge.afterTs
                }
            } else {
                // Catch all 
                return entry.timestamp >= maxAge.afterTs
            }
        }

        return true;

    }
}