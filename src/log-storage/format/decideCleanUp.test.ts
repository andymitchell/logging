import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import type { LogEntry } from '../types.ts';
import { LOG_ENTRY_FORMAT_VERSION, decideCleanUp } from './index.ts';


const writtenAt = Date.UTC(2025, 0, 1);
const writtenAtUlid = ulid(writtenAt);

const current = { type: 'info', message: 'current', ulid: writtenAtUlid, timestamp: writtenAt, format_version: LOG_ENTRY_FORMAT_VERSION };
const unversioned = { type: 'info', message: 'from before versions', ulid: writtenAtUlid, timestamp: writtenAt, id: 3 };
const newer = { ...current, format_version: LOG_ENTRY_FORMAT_VERSION + 1, from_the_future: true };
const junk = { nonsense: true };

const everyEntryIsFresh = () => true;
const everyEntryIsTooOld = () => false;


describe('a store cleaning up its substrate', () => {

    it('keeps a current entry within its max age', () => {
        expect(decideCleanUp(current, everyEntryIsFresh)).toEqual({ action: 'keep' });
    });

    it('deletes a current entry older than its max age', () => {
        expect(decideCleanUp(current, everyEntryIsTooOld)).toEqual({ action: 'delete' });
    });

    it('replaces an older-format entry within its max age with its upgrade, keeping the substrate\'s own keys', () => {
        expect(decideCleanUp(unversioned, everyEntryIsFresh)).toEqual({ action: 'replace', entry: { ...unversioned, format_version: LOG_ENTRY_FORMAT_VERSION } });
    });

    it('deletes an older-format entry older than its max age rather than upgrading it', () => {
        expect(decideCleanUp(unversioned, everyEntryIsTooOld)).toEqual({ action: 'delete' });
    });

    it('keeps a record from a newer library, even when the age test would reject it', () => {
        expect(decideCleanUp(newer, everyEntryIsTooOld)).toEqual({ action: 'keep' });
    });

    it.each<[string, unknown]>([
        ['junk', junk],
        ['an unversioned entry that cannot be dated', { type: 'info', message: 'x', ulid: 'expired-first' }],
        ['a current-version record that is not an entry', { ...current, type: 'shout' }],
    ])('deletes %s, whatever its age', (_label, record) => {
        expect(decideCleanUp(record, everyEntryIsFresh)).toEqual({ action: 'delete' });
    });

    it('asks the age test only about entries, each in the current format', () => {
        const asked: LogEntry[] = [];
        const recordAndKeep = (entry: LogEntry) => { asked.push(entry); return true; };

        for (const record of [current, unversioned, newer, junk]) decideCleanUp(record, recordAndKeep);

        expect(asked).toEqual([current, { ...unversioned, format_version: LOG_ENTRY_FORMAT_VERSION }]);
    });

    it('lets an age test that throws propagate, so the caller can abandon its whole pass', () => {
        const broken = () => { throw new Error('bad max_age'); };

        expect(() => decideCleanUp(current, broken)).toThrow('bad max_age');
    });
});
