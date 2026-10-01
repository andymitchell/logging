import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { MemoryLogStorage } from '../memory/MemoryLogStorage.ts';
import { entryOf } from '../testing-helpers/results.ts';
import type { AcceptLogEntry } from '../types.ts';
import { LOG_ENTRY_FORMAT_VERSION, isCurrentLogEntry, migrateLogEntry } from './index.ts';


const accepted: [string, AcceptLogEntry][] = [
    ['an object context', { type: 'info', message: 'fetched', context: { count: 3 } }],
    ['a string context', { type: 'warn', message: 'fetched', context: 'plain text' }],
    ['an array context', { type: 'error', message: 'fetched', context: ['a', 1] }],
    ['no context', { type: 'debug', message: 'fetched' }],
    ['a critical entry', { type: 'critical', message: 'down' }],
    ['a span start event', { type: 'event', event: { name: 'span_start' }, meta: { type: 'span', span: { top_id: 'a', id: 'b' } } }],
];

const writtenAt = Date.UTC(2025, 0, 1);
const writtenAtUlid = ulid(writtenAt);

/** An entry as a library without `format_version` wrote it. */
function unversioned(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { type: 'info', message: 'from before versions', ulid: writtenAtUlid, timestamp: writtenAt, context: { a: 1 }, ...extra };
}

/** A valid current entry, as a store records it. */
function current(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { type: 'info', message: 'current', ulid: writtenAtUlid, timestamp: writtenAt, format_version: LOG_ENTRY_FORMAT_VERSION, ...extra };
}

const hostileRecords: [string, () => unknown][] = [
    ['a Proxy whose traps throw', () => new Proxy({}, {
        get() { throw new Error('trap'); },
        has() { throw new Error('trap'); },
        ownKeys() { throw new Error('trap'); },
        getPrototypeOf() { throw new Error('trap'); },
        getOwnPropertyDescriptor() { throw new Error('trap'); },
    })],
    ['a revoked Proxy', () => { const { proxy, revoke } = Proxy.revocable({}, {}); revoke(); return proxy; }],
    ['an object whose format_version getter throws', () => ({ ...current(), get format_version(): never { throw new Error('getter'); } })],
    ['an unversioned entry whose message getter throws', () => ({ ...unversioned(), get message(): never { throw new Error('getter'); } })],
    ['a null-prototype object', () => Object.create(null)],
];

const notObjects: [string, unknown][] = [['a number', 42], ['null', null], ['undefined', undefined], ['a string', 'x'], ['an array', []], ['a boolean', true]];


describe('a store reading a record it recorded itself', () => {

    it.each(accepted)('finds an entry with %s current, and hands back the same object', async (_label, entry) => {
        const recorded = entryOf(await new MemoryLogStorage('my-app').add(entry));

        const outcome = migrateLogEntry(recorded);

        expect(outcome.status).toBe('current');
        if (outcome.status === 'current') expect(outcome.entry).toBe(recorded);
    });

    it.each<[string, Record<string, unknown>]>([
        ['a string context', current({ context: 'plain text' })],
        ['an array context', current({ context: ['a', 1] })],
        ['a number context', current({ context: 5 })],
        ['the marker a channel records in place of meta it could not copy', current({ meta: 'redact:uncopyable' })],
    ])('finds an entry with %s current', (_label, record) => {
        expect(migrateLogEntry(record).status).toBe('current');
    });

    it('keeps keys the substrate added to a current entry', () => {
        const outcome = migrateLogEntry(current({ id: 7 }));

        expect(outcome).toEqual({ status: 'current', entry: current({ id: 7 }) });
    });
});


describe('a store cleaning up entries written before entries were versioned', () => {

    it('upgrades an entry that has a timestamp, keeping the timestamp it was given', () => {
        const record = unversioned({ timestamp: writtenAt + 5 });

        const outcome = migrateLogEntry(record);

        expect(outcome).toEqual({ status: 'migrated', entry: { ...record, format_version: LOG_ENTRY_FORMAT_VERSION } });
    });

    it('dates an entry without a timestamp by the time encoded in its ulid', () => {
        const { timestamp: _discarded, ...record } = unversioned();

        const outcome = migrateLogEntry(record);

        expect(outcome).toEqual({ status: 'migrated', entry: { ...record, timestamp: writtenAt, format_version: LOG_ENTRY_FORMAT_VERSION } });
    });

    it('cannot upgrade an entry with no timestamp whose id is not a ulid, so finds it unrecognised', () => {
        const { timestamp: _discarded, ...record } = unversioned({ ulid: 'expired-first' });

        expect(migrateLogEntry(record)).toEqual({ status: 'unrecognised' });
    });

    it('keeps every key of the record, including keys the substrate added, so the row can be rewritten in place', () => {
        const outcome = migrateLogEntry(unversioned({ id: 7, stack_trace: 'at x' }));

        expect(outcome.status).toBe('migrated');
        if (outcome.status === 'migrated') expect(outcome.entry).toMatchObject({ id: 7, stack_trace: 'at x' });
    });

    it('upgrades a span event, which has no message', () => {
        const record = unversioned({ type: 'event', message: undefined, event: { name: 'span_end' }, meta: { type: 'span', span: { top_id: 'a', id: 'b' } } });

        expect(migrateLogEntry(record).status).toBe('migrated');
    });

    it('never changes the record it was given', () => {
        const { timestamp: _discarded, ...record } = unversioned();
        const before = structuredClone(record);

        migrateLogEntry(record);

        expect(record).toEqual(before);
    });

    it('produces an entry that is current: migrating it again changes nothing', () => {
        const outcome = migrateLogEntry(unversioned());
        if (outcome.status !== 'migrated') throw new Error(`expected a migration, got ${outcome.status}`);

        const again = migrateLogEntry(outcome.entry);

        expect(again.status).toBe('current');
        if (again.status === 'current') expect(again.entry).toBe(outcome.entry);
    });

    it.each<[string, Record<string, unknown>]>([
        ['an unknown type', unversioned({ type: 'shout' })],
        ['a missing message', unversioned({ message: undefined })],
        ['a numeric ulid', unversioned({ ulid: 7 })],
        ['an event with an unknown name', unversioned({ type: 'event', event: { name: 'span_paused' } })],
    ])('finds an unversioned record with %s unrecognised', (_label, record) => {
        expect(migrateLogEntry(record)).toEqual({ status: 'unrecognised' });
    });
});


describe('a store finding a record written by a newer library', () => {

    it.each([LOG_ENTRY_FORMAT_VERSION + 1, 99])('leaves format_version %d alone, whatever else the record holds', (format_version) => {
        expect(migrateLogEntry({ format_version, anything: 'unknown to this version' })).toEqual({ status: 'newer' });
    });
});


describe('a store finding junk on its substrate', () => {

    it.each<[string, unknown]>([
        ['1, which no writer ever stamped', 1],
        ['0', 0],
        ['a fraction', 2.5],
        ['the current version as a string', '2'],
        ['null', null],
    ])('finds format_version %s unrecognised', (_label, format_version) => {
        expect(migrateLogEntry(current({ format_version }))).toEqual({ status: 'unrecognised' });
    });

    it.each(notObjects)('finds %s unrecognised', (_label, record) => {
        expect(migrateLogEntry(record)).toEqual({ status: 'unrecognised' });
    });

    it.each<[string, Record<string, unknown>]>([
        ['an unknown type', current({ type: 'shout' })],
        ['a non-string message', current({ message: 42 })],
        ['no ulid', current({ ulid: undefined })],
        ['no timestamp', current({ timestamp: undefined })],
    ])('finds a current-version record with %s unrecognised', (_label, record) => {
        expect(migrateLogEntry(record)).toEqual({ status: 'unrecognised' });
    });

    it.each(hostileRecords)('finds %s unrecognised, without throwing', (_label, build) => {
        expect(migrateLogEntry(build())).toEqual({ status: 'unrecognised' });
    });
});


describe('a store deciding whether a record may leave it', () => {

    const everyRecord: [string, unknown][] = [
        ['a current entry', current()],
        ['a current entry with a string context', current({ context: 'text' })],
        ['an unversioned entry', unversioned()],
        ['a newer entry', current({ format_version: LOG_ENTRY_FORMAT_VERSION + 1 })],
        ['a current-version record that is not an entry', current({ type: 'shout' })],
        ...notObjects,
        ...hostileRecords.map(([label, build]): [string, unknown] => [label, build()]),
    ];

    it.each(everyRecord)('agrees with the migration on whether %s is current', (_label, record) => {
        expect(isCurrentLogEntry(record)).toBe(migrateLogEntry(record).status === 'current');
    });

    it('lets only a current entry through', () => {
        const readable = everyRecord.map(([, record]) => record).filter(isCurrentLogEntry);

        expect(readable).toEqual([current(), current({ context: 'text' })]);
    });
});
