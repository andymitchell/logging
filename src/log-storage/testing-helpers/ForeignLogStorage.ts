import type { LoggingError } from "../../failures/types.ts";
import type { AcceptLogEntry, ILogStorage, LogEntry } from "../types.ts";
import { LOG_ENTRY_FORMAT_VERSION } from "../format/version.ts";


/**
 * How a {@link ForeignLogStorage} breaks the contract that every call resolves a result: it throws, rejects,
 * answers in the shape a store written for an older version of this library would (a bare entry from `add`,
 * a bare array from `get`, nothing from `reset` and `forceClearOldEntries`), or answers nothing at all.
 */
export type ForeignBehaviour = 'throws' | 'rejects' | 'answers-old-shape' | 'answers-nothing';

/**
 * How its `reportInternalFailure` behaves: records the error, or breaks while doing so.
 */
export type ForeignReportBehaviour = 'records' | 'throws' | 'rejects';


/**
 * A store written without `BaseLogStorage` that breaks the contract, for testing the last line of defence
 * in loggers, spans, trace viewers and Channels facades.
 *
 * It has `onFailure` and `reportInternalFailure`, so a logger or span can be built with it; every other
 * call then misbehaves as `behaviour` says.
 *
 * @example
 * const storage = new ForeignLogStorage('rejects');
 * const result = await new Logger(storage).log('x'); // an `unexpected` failure from `Logger`
 * storage.reported; // [result.error]
 */
export class ForeignLogStorage implements ILogStorage {

    /** Every error handed to `reportInternalFailure`, in order. */
    reported: LoggingError[] = [];

    constructor(public behaviour: ForeignBehaviour, public reportBehaviour: ForeignReportBehaviour = 'records') {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a foreign store answers whatever it likes; that is what is under test
    add(entry: AcceptLogEntry): Promise<any> {
        return this.#answer(() => ({ ...entry, ulid: 'foreign', timestamp: 0, format_version: LOG_ENTRY_FORMAT_VERSION } satisfies LogEntry));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
    get(): Promise<any> {
        return this.#answer(() => []);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
    forceClearOldEntries(): Promise<any> {
        return this.#answer(() => undefined);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
    reset(): Promise<any> {
        return this.#answer(() => undefined);
    }

    onFailure(): () => void {
        return () => undefined;
    }

    // Returns a promise when set to reject, as an `async` implementation would.
    reportInternalFailure(error: LoggingError): void | Promise<void> {
        this.reported.push(error);
        if (this.reportBehaviour === 'throws') throw new Error('foreign failure hook bug');
        if (this.reportBehaviour === 'rejects') return Promise.reject(new Error('foreign failure hook bug'));
    }

    #answer(oldShape: () => unknown): Promise<unknown> {
        switch (this.behaviour) {
            case 'throws': throw new Error('foreign store bug');
            case 'rejects': return Promise.reject(new Error('foreign store bug'));
            case 'answers-old-shape': return Promise.resolve(oldShape());
            case 'answers-nothing': return Promise.resolve(undefined);
        }
    }
}
