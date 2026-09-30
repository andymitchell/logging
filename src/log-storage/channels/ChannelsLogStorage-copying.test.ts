import { describe, it, expect, onTestFinished } from 'vitest';
import { BUILT_IN_SENSITIVE_KEYS } from '@andymitchell/clone-to-json-safe';
import { ChannelsLogStorage } from './ChannelsLogStorage.ts';
import { MemoryLogStorage } from '../memory/MemoryLogStorage.ts';
import { Trace } from '../../trace/Trace.ts';
import type { LogCallMaskingOptions, LogStorageOptions } from '../types.ts';
import { entriesOf, entryOf } from '../testing-helpers/results.ts';
import { recordUnhandledRejections } from '../testing-helpers/recordUnhandledRejections.ts';

/** A secret under a key that names it, and one that only its shape gives away. */
const secrets = { password: 'hunter2', note: 'reach me at bob@example.com' };

/** A stand-in for `target` whose every read throws. */
function proxyWhoseTrapsThrow<T extends object>(target: T): T {
    return new Proxy(target, {
        get() { throw new Error('trap'); },
        ownKeys() { throw new Error('trap'); },
        getPrototypeOf() { throw new Error('trap'); },
        getOwnPropertyDescriptor() { throw new Error('trap'); },
    });
}

/** Contexts an app might log that hold a value `structuredClone` cannot copy (or, for some runtimes, can). */
const uncopyableContexts: [string, () => Record<string, unknown>][] = [
    ['a function', () => ({ ...secrets, parse: () => 1 })],
    ['a Response', () => ({ ...secrets, response: new Response('body') })],
    ['an AbortSignal', () => ({ ...secrets, signal: new AbortController().signal })],
    ['a Proxy whose traps throw', () => ({ ...secrets, value: proxyWhoseTrapsThrow({}) })],
    ['a throwing getter', () => ({ ...secrets, get lazy(): never { throw new Error('getter'); } })],
    ['a Date beside a function', () => ({ ...secrets, at: new Date(0), parse: () => 1 })],
    ['a circular reference beside a function', () => { const context: Record<string, unknown> = { ...secrets, parse: () => 1 }; context.self = context; return context; }],
];

/** Two channels that mask differently: one by the built-in key names, one that also treats `note` as a secret key. */
const channelOptions: LogStorageOptions[] = [{}, { sensitive_context_key_names: [...BUILT_IN_SENSITIVE_KEYS, 'note'] }];

describe('an app logging a value structuredClone cannot copy through a Channels facade', () => {

    it.each(uncopyableContexts)('records the entry in every channel, as each channel\'s store records it when written to directly, when the context holds %s', async (_label, context) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const children = channelOptions.map((options, index) => new MemoryLogStorage(`channel-${index}`, options));
        const storage = new ChannelsLogStorage('app', children.map(child => ({ storage: child })));

        const result = await storage.add({ type: 'warn', message: 'fetched', context: context() });

        expect(result.ok).toBe(true);
        for (const [index, child] of children.entries()) {
            const direct = entryOf(await new MemoryLogStorage('direct', channelOptions[index]).add({ type: 'warn', message: 'fetched', context: context() }));
            const recorded = entriesOf(await child.get());
            expect(recorded.map(entry => entry.ulid)).toEqual([result.entry?.ulid]);
            expect(recorded[0]?.context).toEqual(direct.context);
        }
        expect(await unhandled.settled()).toEqual([]);
    });

    it.each(uncopyableContexts)('never records a secret held beside %s, in any channel', async (_label, context) => {
        const children = channelOptions.map((options, index) => new MemoryLogStorage(`channel-${index}`, options));
        const storage = new ChannelsLogStorage('app', children.map(child => ({ storage: child })));

        await storage.add({ type: 'warn', message: 'fetched', context: context() });

        for (const child of children) {
            const recorded = JSON.stringify(entriesOf(await child.get()));
            expect(recorded).toContain('fetched');
            expect(recorded).not.toContain(secrets.password);
            expect(recorded).not.toContain('bob@example.com');
        }
    });

    it('keeps each channel\'s copy its own, so one channel\'s transform cannot change what another records', async () => {
        const untouched = new MemoryLogStorage('untouched');
        const storage = new ChannelsLogStorage('app', [
            { storage: new MemoryLogStorage('mutating'), transform: entry => {
                if (entry.type === 'event') entry.event.name = 'span_end';
                entry.context.tags.push('changed');
                entry.meta.trace.id = 'changed';
                return entry;
            } },
            { storage: untouched },
        ]);

        await storage.add({ type: 'event', event: { name: 'span_start' }, context: { parse: () => 1, tags: ['original'] }, meta: { trace: { id: 't1' } } });

        const [recorded] = entriesOf(await untouched.get());
        expect(recorded).toMatchObject({ event: { name: 'span_start' }, context: { tags: ['original'] }, meta: { trace: { id: 't1' } } });
    });

    it('hands a transform the JSON copy, in which each value structuredClone cannot copy is its redact marker', async () => {
        let seen: unknown;
        const storage = new ChannelsLogStorage('app', [{ storage: new MemoryLogStorage('memory'), transform: entry => { seen = entry.context; return entry; } }]);

        await storage.add({ type: 'warn', message: 'fetched', context: { parse: () => 1, at: new Date(0) } });

        expect(seen).toEqual({ parse: 'redact:Function', at: 'redact:Date:1970-01-01T00:00:00.000Z' });
    });

    it('hands a transform an exact copy when structuredClone can copy the entry', async () => {
        let seen: unknown;
        const storage = new ChannelsLogStorage('app', [{ storage: new MemoryLogStorage('memory'), transform: entry => { seen = entry.context; return entry; } }]);

        await storage.add({ type: 'warn', message: 'fetched', context: { at: new Date(0), big: 10n } });

        expect(seen).toEqual({ at: new Date(0), big: 10n });
    });
});


describe('an app logging a context nested too deeply to copy through a Channels facade', () => {

    /** Deeper than either `structuredClone` or a JSON copy can walk before running out of stack. */
    function nestedTooDeeplyToCopy(): Record<string, unknown> {
        let value: Record<string, unknown> = { leaf: 'bottom' };
        for (let depth = 0; depth < 100_000; depth++) value = { next: value };
        return value;
    }

    it('records the entry in every channel, still in its trace, with the context marked as uncopyable', async () => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const children = [new MemoryLogStorage('a'), new MemoryLogStorage('b')];
        const trace = new Trace(new ChannelsLogStorage('app', children.map(child => ({ storage: child }))));

        const result = await trace.warn('deep', nestedTooDeeplyToCopy());

        expect(result.ok).toBe(true);
        for (const child of children) {
            const recorded = entriesOf(await child.get()).find(entry => entry.ulid === result.entry?.ulid);
            expect(recorded).toMatchObject({ type: 'warn', message: 'deep', context: 'redact:uncopyable', meta: { type: 'span', span: trace.getFullId() } });
        }
        expect(await unhandled.settled()).toEqual([]);
    });

    it('gives each channel its own copy of every other part of the entry, so one channel\'s transform reaches no other', async () => {
        const recorder = new MemoryLogStorage('recorder');
        const storage = new ChannelsLogStorage('app', [
            { storage: new MemoryLogStorage('renamer'), transform: entry => {
                if (entry.type === 'event') entry.event.name = 'span_end';
                return entry;
            } },
            { storage: recorder },
        ]);

        const result = await storage.add({ type: 'event', event: { name: 'span_start' }, context: nestedTooDeeplyToCopy() });

        expect(entriesOf(await recorder.get())).toMatchObject([{ type: 'event', event: { name: 'span_start' }, context: 'redact:uncopyable' }]);
        expect(result.entry).toMatchObject({ event: { name: 'span_start' } });
    });
});


describe('an app passing per-call options that cannot be copied through a Channels facade', () => {

    const UUID = '550e8400-e29b-41d4-a716-446655440000';
    const MASKED_UUID = '550....00';
    const directive = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' as const }] };

    const uncopyableOptions: [string, () => LogCallMaskingOptions][] = [
        ['hold a function', () => { const options = { ...directive, onLogged: () => 1 }; return options; }],
        ['are a Proxy whose traps throw', () => proxyWhoseTrapsThrow<LogCallMaskingOptions>(directive)],
    ];

    it.each(uncopyableOptions)('records the entry in every channel without them, and fails the write naming them, when they %s', async (_label, options) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const flagged = new MemoryLogStorage('flagged', { allow_per_call_unmasking: true });
        const other = new MemoryLogStorage('other');
        const storage = new ChannelsLogStorage('app', [{ storage: flagged }, { storage: other }]);

        const result = await storage.add({ type: 'info', message: 'm', context: { user: { id: UUID } } }, options());

        for (const child of [flagged, other]) {
            const recorded = entriesOf(await child.get()).map(entry => ({ ulid: entry.ulid, id: entry.context.user.id }));
            expect(recorded).toEqual([{ ulid: result.entry?.ulid, id: MASKED_UUID }]);
        }
        expect(result.ok).toBe(false);
        expect(result.error?.failures).toEqual([{
            source: 'ChannelsLogStorage:app',
            operation: 'write',
            message: 'Could not copy the per-call options, so every channel was given the entry without them.',
        }]);
        expect(await unhandled.settled()).toEqual([]);
    });
});
