/**
 * The envelope format this version of the library writes, and the only one its stores return.
 *
 * Every entry a store records is stamped with it, so a store opened by a later library can tell an entry
 * written in an older format (and migrate it) from one written by a newer library (and leave it alone).
 */
export const LOG_ENTRY_FORMAT_VERSION = 2 as const;

/**
 * The literal type of {@link LOG_ENTRY_FORMAT_VERSION}: a `LogEntry` is always in the current format.
 */
export type LogEntryFormatVersion = typeof LOG_ENTRY_FORMAT_VERSION;
