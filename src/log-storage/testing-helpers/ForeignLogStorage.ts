import type { LoggingError } from "../../failures/types.ts";
import type { AcceptLogEntry, ILogStorage, LogEntry } from "../types.ts";


/**
 * How a {@link ForeignLogStorage}'s `add` breaks the contract that a write resolves a result.
 */
export type ForeignAddBehaviour = 'throws' | 'rejects' | 'answers-bare-entry' | 'answers-nothing';

/**
 * How its `reportInternalFailure` behaves: records the error, or breaks while doing so.
 */
export type ForeignReportBehaviour = 'records' | 'throws' | 'rejects';


/**
 * A store written without `BaseLogStorage` that breaks the write contract, for testing the last line of
 * defence in loggers and spans.
 *
 * It has `onFailure` and `reportInternalFailure`, so a logger or span can be built with it; its `add` then
 * throws, rejects, or answers with something that is not a write result (e.g. a bare entry, as a store
 * written for an older version of this library would).
 *
 * @example
 * const storage = new ForeignLogStorage('rejects');
 * const result = await new Logger(storage).log('x'); // an `unexpected` failure from `Logger`
 * storage.reported; // [result.error]
 */
export class ForeignLogStorage implements ILogStorage {

    /** Every error handed to `reportInternalFailure`, in order. */
    reported: LoggingError[] = [];

    constructor(public addBehaviour: ForeignAddBehaviour, public reportBehaviour: ForeignReportBehaviour = 'records') {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a foreign store answers whatever it likes; that is what is under test
    add(entry: AcceptLogEntry): Promise<any> {
        switch (this.addBehaviour) {
            case 'throws': throw new Error('foreign store bug');
            case 'rejects': return Promise.reject(new Error('foreign store bug'));
            case 'answers-bare-entry': return Promise.resolve<LogEntry>({ ...entry, ulid: 'foreign', timestamp: 0 });
            case 'answers-nothing': return Promise.resolve(undefined);
        }
    }

    async get(): Promise<never[]> {
        return [];
    }

    async forceClearOldEntries(): Promise<void> {}

    async reset(): Promise<void> {}

    onFailure(): () => void {
        return () => undefined;
    }

    // Returns a promise when set to reject, as an `async` implementation would.
    reportInternalFailure(error: LoggingError): void | Promise<void> {
        this.reported.push(error);
        if (this.reportBehaviour === 'throws') throw new Error('foreign failure hook bug');
        if (this.reportBehaviour === 'rejects') return Promise.reject(new Error('foreign failure hook bug'));
    }
}
