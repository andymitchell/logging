import { describe, it, expect, expectTypeOf } from 'vitest';
import { MemoryLogStorage } from './memory/MemoryLogStorage.ts';
import { LOG_ENTRY_FORMAT_VERSION } from './format/version.ts';
import { LogEntrySchema } from './schemas.ts';
import { entryOf } from './testing-helpers/results.ts';
import type { AcceptLogEntry, LogEntry } from './types.ts';


describe('an app recording an entry', () => {

    it('gets back an entry stamped with the current format version', async () => {
        const storage = new MemoryLogStorage('my-app');

        const entry = entryOf(await storage.add({ type: 'info', message: 'fetched' }));

        expect(entry.format_version).toBe(LOG_ENTRY_FORMAT_VERSION);
    });

    it('cannot choose the format version, even from JavaScript', async () => {
        const storage = new MemoryLogStorage('my-app');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a caller bypassing the type is what is under test
        const claimsAnotherVersion = { type: 'info', message: 'fetched', format_version: 99 } as any;

        const entry = entryOf(await storage.add(claimsAnotherVersion));

        expect(entry.format_version).toBe(LOG_ENTRY_FORMAT_VERSION);
        expect((await storage.get()).entries.map(stored => stored.format_version)).toEqual([LOG_ENTRY_FORMAT_VERSION]);
    });

    it.each<[string, AcceptLogEntry]>([
        ['an object context', { type: 'info', message: 'fetched', context: { count: 3 } }],
        ['a string context', { type: 'warn', message: 'fetched', context: 'plain text' }],
        ['an array context', { type: 'error', message: 'fetched', context: ['a', 1] }],
        ['no context', { type: 'debug', message: 'fetched' }],
        ['a span start event', { type: 'event', event: { name: 'span_start' }, meta: { type: 'span', span: { top_id: 'a', id: 'b' } } }],
    ])('records an entry with %s that parses under the public entry schema', async (_label, accepted) => {
        const storage = new MemoryLogStorage('my-app');

        const entry = entryOf(await storage.add(accepted));

        expect(LogEntrySchema.safeParse(entry).success).toBe(true);
    });
});


describe('the entry types a caller writes against', () => {

    it('always carry the current format version', () => {
        expectTypeOf<LogEntry['format_version']>().toEqualTypeOf<typeof LOG_ENTRY_FORMAT_VERSION>();
        expectTypeOf<LogEntry['format_version']>().toEqualTypeOf<2>();
    });

    it('do not let a caller pass a format version to add', () => {
        // @ts-expect-error the store stamps the format version; a caller cannot set it
        const accepted: AcceptLogEntry = { type: 'info', message: 'fetched', format_version: LOG_ENTRY_FORMAT_VERSION };
        void accepted;
    });

    it('allow meta of any shape, as they allow context of any shape', () => {
        const entry: LogEntry<{ a: 1 }, string> = { type: 'info', message: 'x', ulid: 'u', timestamp: 0, format_version: LOG_ENTRY_FORMAT_VERSION, context: { a: 1 }, meta: 'redact:uncopyable' };

        expectTypeOf(entry.meta).toEqualTypeOf<string | undefined>();
    });
});
