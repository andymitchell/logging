import { expect } from 'vitest';
import type { ConformanceClaim } from "../types.ts";
import type { LoggingError } from "../../../failures/types.ts";
import type { LogEntry } from "../../../log-storage/types.ts";
import { LogEntrySchema } from "../../../log-storage/schemas.ts";
import { LOG_ENTRY_FORMAT_VERSION } from "../../../log-storage/format/index.ts";
import { entriesOf, entryOf, recordFailures } from "../../../log-storage/testing-helpers/results.ts";
import { asEntries, asEntryList, currentEntry, junkRecords, LEAK_CANARY, malformedAcceptEntries, newerRecord, revokedArray, unversionedEntry, withChosenFormatVersion } from "../../helpers/fixtures.ts";
import { expectSubstrateHolds, identities, keepsEntries, ulidsOf } from "../../helpers/records.ts";


/** The failure `add` answers for something that is not an entry (dec-add-rejects-invalid-entry). */
const NOT_AN_ENTRY = { operation: 'write', message: 'The entry is not a valid log entry.' };

/** The failure `reset` answers when any of its entries is not a current entry (dec-reset-rejects-invalid-entries). */
const NOT_ALL_ENTRIES = { operation: 'reset', message: 'Some entries are not valid log entries.' };


// Every entry a store records carries the current format_version, stamped by the store; a caller cannot choose it.
export const stampsTheCurrentFormatVersion: ConformanceClaim = {
    name: 'stamps every entry it records with the current format version, whatever the caller passes [dec-format-version-stamped-by-store-only] [dec-log-entry-format-version]',
    async check(harness) {
        const store = await harness.instance();

        const plain = entryOf(await store.add({ type: 'info', message: 'plain' }));
        const chosen = entryOf(await store.add(withChosenFormatVersion({ type: 'info', message: 'chose a version' }, 99)));

        for( const entry of [plain, chosen] ) {
            expect(entry.format_version).toBe(LOG_ENTRY_FORMAT_VERSION);
            expect(LogEntrySchema.safeParse(entry).success).toBe(true);
        }
        if( harness.raw ) {
            await expectSubstrateHolds(harness.raw, [plain, chosen].map(({ ulid }) => expect.objectContaining({ ulid, format_version: LOG_ENTRY_FORMAT_VERSION })));
        }
    },
};

// `add` answers a failed result for anything that is not an entry, tells the listeners once, and quotes none of it.
export const addRefusesNonEntries: ConformanceClaim = {
    name: 'fails the write of anything that is not an entry, tells the listeners once, and quotes none of it [dec-add-rejects-invalid-entry]',
    async check(harness) {
        const store = await harness.instance();
        const failures = recordFailures(store);

        const errors: (LoggingError | undefined)[] = [];
        for( const [label, entry] of malformedAcceptEntries() ) {
            const result = await store.add(entry);
            expect(result.ok, label).toBe(false);
            expect(result.entry, label).toBeUndefined();
            expect(whatFailed(result.error), label).toEqual([NOT_AN_ENTRY]);
            expect(JSON.stringify(result.error), label).not.toContain(LEAK_CANARY);
            errors.push(result.error);
        }

        expectHeardOnce(failures.heard, errors);
    },
};

// A refused `add` records nothing: the entries written around it are all the store holds.
export const aRefusedAddRecordsNothing: ConformanceClaim = {
    name: 'records nothing of a refused write, keeping only the entries written around it [dec-add-rejects-invalid-entry]',
    async check(harness) {
        const store = await harness.instance();

        const before = entryOf(await store.add({ type: 'info', message: 'before' }));
        for( const [, entry] of malformedAcceptEntries() ) await store.add(entry);
        const after = entryOf(await store.add({ type: 'info', message: 'after' }));

        expect(ulidsOf(entriesOf(await store.get()))).toEqual(keepsEntries(harness) ? [before.ulid, after.ulid] : []);
        if( harness.raw ) await expectSubstrateHolds(harness.raw, [before, after].map(({ ulid }) => expect.objectContaining({ ulid })));
    },
};

// `reset` fails as a whole when any entry is not a current entry, and the store is left as it was.
export const resetRefusesAnyNonEntry: ConformanceClaim = {
    name: 'fails a reset holding any record that is not a current entry, tells the listeners once, and leaves the store unchanged [dec-reset-rejects-invalid-entries]',
    async check(harness) {
        const store = await harness.instance();
        await store.add({ type: 'info', message: 'held before' });
        const before = identities(entriesOf(await store.get()));
        const failures = recordFailures(store);

        const errors: (LoggingError | undefined)[] = [];
        for( const notAnEntry of [...junkRecords(), newerRecord(2)] ) {
            const result = await store.reset(asEntries([currentEntry(1), notAnEntry]));
            expect(result.ok).toBe(false);
            expect(whatFailed(result.error)).toEqual([NOT_ALL_ENTRIES]);
            expect(identities(entriesOf(await store.get()))).toEqual(before);
            errors.push(result.error);
        }

        expectHeardOnce(failures.heard, errors);
    },
};

// `reset` refuses entries from before entries were versioned (a caller upgrades them first), and anything that is not a list of entries.
export const resetRefusesUnversionedEntriesAndNonLists: ConformanceClaim = {
    name: 'fails a reset given entries from before entries were versioned, or anything that is not a list of entries, leaving the store unchanged [dec-reset-rejects-invalid-entries]',
    async check(harness) {
        const store = await harness.instance();
        await store.add({ type: 'info', message: 'held before' });
        const before = identities(entriesOf(await store.get()));

        const notEntryLists: [string, unknown][] = [
            ['an entry from before entries were versioned', [unversionedEntry(1, Date.now(), { withTimestamp: true })]],
            ['a single entry rather than a list', currentEntry(1)],
            ['null', null],
            ['a list with a gap where an entry should be', Object.assign([], { length: 1 })],
            ['a revoked Proxy', revokedArray()],
        ];
        for( const [label, notAnEntryList] of notEntryLists ) {
            const result = await store.reset(asEntryList(notAnEntryList));
            expect(whatFailed(result.error), label).toEqual([NOT_ALL_ENTRIES]);
            expect(identities(entriesOf(await store.get())), label).toEqual(before);
        }
    },
};

// `reset` with current entries replaces what the store holds with exactly those entries.
export const resetReplacesWithCurrentEntries: ConformanceClaim = {
    name: 'replaces what it holds with exactly the current entries a reset is given [dec-reset-rejects-invalid-entries]',
    async check(harness) {
        const store = await harness.instance();
        await store.add({ type: 'info', message: 'replaced' });
        const given = [currentEntry(1), currentEntry(2)];

        expect(await store.reset(given)).toEqual({ ok: true });

        expect(identities(entriesOf(await store.get()))).toEqual(keepsEntries(harness) ? identities(given) : []);
    },
};

// `context` and `meta` hold whatever was logged, per entry; one store holds entries of different shapes side by side.
export const contextAndMetaAreKeptAsLogged: ConformanceClaim = {
    name: 'records and returns each entry\'s context and meta exactly as logged, whatever their shape [dec-log-entry-context-is-opaque] [dec-log-entry-meta-is-opaque]',
    async check(harness) {
        const store = await harness.instance();
        const logged = [
            ...[5, 'text', ['a'], { a: 1 }].map(context => ({ message: `context ${JSON.stringify(context)}`, context, meta: undefined })),
            ...['text', { type: 'span', span: { top_id: 'a', id: 'b' } }].map(meta => ({ message: `meta ${JSON.stringify(meta)}`, context: undefined, meta })),
        ];

        const recorded: LogEntry[] = [];
        for( const { message, context, meta } of logged ) recorded.push(entryOf(await store.add({ type: 'info', message, context, meta })));

        expect(asLogged(recorded)).toEqual(logged);
        expect(asLogged(entriesOf(await store.get()))).toEqual(keepsEntries(harness) ? logged : []);
    },
};

// Entries come back in the order `add` was called, even when no call waited for the one before, with ulids ascending.
export const addsComeBackInCallOrder: ConformanceClaim = {
    name: 'returns entries in the order add was called, even when no call waited for the one before, with ascending ulids [dec-add-preserves-call-order]',
    skipReason: harness => keepsEntries(harness) ? undefined : 'Binds stores that keep entries; this store keeps none, so has no order to show.',
    async check(harness) {
        const store = await harness.instance();
        const messages = Array.from({ length: 10 }, (_, index) => `call ${index}`);

        const written = await Promise.all(messages.map(message => store.add({ type: 'info', message })));
        for( const result of written ) expect(result.ok).toBe(true);

        const entries = entriesOf(await store.get());
        expect(entries.map(entry => entry.message)).toEqual(messages);
        const ulids = ulidsOf(entries);
        expect(ulids).toEqual([...ulids].sort());
        expect(new Set(ulids).size).toBe(ulids.length);
    },
};


/** What each failure in `error` says, without its `source`, which names the store. */
function whatFailed(error: LoggingError | undefined): { operation: string, message: string }[] | undefined {
    return error?.failures.map(({ operation, message }) => ({ operation, message }));
}

/** Check the listeners heard exactly `errors`, each once and in order, as the very objects the calls returned. */
function expectHeardOnce(heard: readonly LoggingError[], errors: readonly (LoggingError | undefined)[]): void {
    expect(heard).toHaveLength(errors.length);
    heard.forEach((error, index) => expect(error).toBe(errors[index]));
}

/** What a caller logged in each entry. */
function asLogged(entries: readonly LogEntry[]): { message: string | undefined, context: unknown, meta: unknown }[] {
    return entries.map(({ message, context, meta }) => ({ message, context, meta }));
}
