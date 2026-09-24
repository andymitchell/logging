/**
 * Runtime type guards for log and trace entries.
 *
 * `@andymitchell/logging-ui-react` imports these, so renaming or removing one is a breaking change for it.
 */

export { isLogEntrySimple, isEventLogEntry } from "./log-storage/types.ts";
export { isEventLogEntrySpanStart } from "./trace/types.ts";
