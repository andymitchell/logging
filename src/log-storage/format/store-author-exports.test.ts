import { describe, it, expect, expectTypeOf } from 'vitest';
import * as defaultEntry from '../../index.ts';
import * as browserEntry from '../../index-browser.ts';
import * as nodeEntry from '../../index-node.ts';
import type { LogEntryFormatVersion, MigrationOutcome } from '../../index-types.ts';
import { MemoryLogStorage } from '../memory/MemoryLogStorage.ts';
import { entryOf } from '../testing-helpers/results.ts';
import { currentEntry, newerRecord, unversionedEntry } from '../testing-helpers/storedRecords.ts';
import type { LogEntry } from '../types.ts';


const writtenAt = Date.UTC(2025, 0, 1);

const entryPoints = [['default', defaultEntry], ['browser', browserEntry], ['node', nodeEntry]] as const;


describe('a store author outside the package', () => {

    it.each(entryPoints)('upgrades an entry from an older library with the migrator from the %s entry point', (_name, packageEntry) => {
        const outcome = packageEntry.migrateLogEntry(unversionedEntry(1, writtenAt, { withTimestamp: false }));

        expect(outcome).toEqual({ status: 'migrated', entry: currentEntry(1, writtenAt) });
    });

    it.each(entryPoints)('lets only a current entry through with the guard from the %s entry point', (_name, packageEntry) => {
        const records = [currentEntry(1, writtenAt), unversionedEntry(2, writtenAt, { withTimestamp: true }), newerRecord(3, writtenAt), { nonsense: true }];

        expect(records.map(packageEntry.isCurrentLogEntry)).toEqual([true, false, false, false]);
    });

    it.each(entryPoints)('reads the version the stores write from the %s entry point', async (_name, packageEntry) => {
        const recorded = entryOf(await new MemoryLogStorage('my-app').add({ type: 'info', message: 'hello' }));

        expect(packageEntry.LOG_ENTRY_FORMAT_VERSION).toBe(recorded.format_version);
    });

    it('can name what the migrator returns and the version an entry carries', () => {
        expectTypeOf(defaultEntry.migrateLogEntry).returns.toEqualTypeOf<MigrationOutcome>();
        expectTypeOf<LogEntry['format_version']>().toEqualTypeOf<LogEntryFormatVersion>();
    });
});


describe('an app restoring entries saved by an older version', () => {

    it('restores every entry it can read once each is run through the migrator, and nothing else', async () => {
        const backup: unknown[] = [
            unversionedEntry(1, writtenAt, { withTimestamp: false }),
            currentEntry(2, writtenAt),
            newerRecord(3, writtenAt),
            { nonsense: true },
        ];
        const storage = new MemoryLogStorage('my-app');

        const entries = backup.flatMap(record => {
            const outcome = defaultEntry.migrateLogEntry(record);
            return outcome.status === 'current' || outcome.status === 'migrated' ? [outcome.entry] : [];
        });
        const restored = await storage.reset(entries);

        expect(restored).toEqual({ ok: true });
        expect((await storage.get()).entries).toEqual([currentEntry(1, writtenAt), currentEntry(2, writtenAt)]);
    });
});
