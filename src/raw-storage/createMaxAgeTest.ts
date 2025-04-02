import type { MaxAge } from "../types.ts";
import type { LogEntry } from "./types.ts";

export default function createMaxAgeTest(maxAge:MaxAge) {
    const afterTs = Date.now()-maxAge.any_ms;
    const afterErrorsTs = maxAge.error_ms? (Date.now()-maxAge.error_ms) : afterTs;

    return (entry:LogEntry):boolean => {
        if( entry.type==='error' ) {
            return entry.timestamp>=afterErrorsTs;
        } else {
            return entry.timestamp>=afterTs;
        }
    }
}