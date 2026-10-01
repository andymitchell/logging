import { describe, it, expect, onTestFinished, vi } from 'vitest';
import { BUILT_IN_SENSITIVE_KEYS } from '@andymitchell/clone-to-json-safe';
import { ChannelsLogStorage } from './ChannelsLogStorage.ts';
import { MemoryLogStorage } from '../memory/MemoryLogStorage.ts';
import { Logger } from '../../log/Logger.ts';
import type { LogCallMaskingOptions } from '../types.ts';
import { entriesOf, entryOf } from '../testing-helpers/results.ts';

/** Assembled at runtime: a live Stripe key's shape in source trips secret scanners. */
const API_KEY = ['sk', 'live', '4eC39HqLyjWDarjtT1zdp7dc'].join('_');
const PASSWORD = 'hunter2';

/** A secret under a key that names it, and one that only its shape gives away. */
const signIn = () => ({ password: PASSWORD, note: `retrying with ${API_KEY}` });

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const MASKED_UUID = '550....00';
const keepUserIdReadable: LogCallMaskingOptions = { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] };

/** The context as a store with the default options records it when written to directly. */
async function maskedByDefault(context: unknown): Promise<unknown> {
    return entryOf(await new MemoryLogStorage('direct').add({ type: 'info', message: 'direct', context })).context;
}

/** Every line printed with `console.log` during the test, each as its arguments. */
function recordConsoleLog(): unknown[][] {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    onTestFinished(() => consoleLog.mockRestore());
    return consoleLog.mock.calls;
}

/** Deeper than the masker can walk before running out of stack. */
function nestedTooDeeplyToMask(): Record<string, unknown> {
    let value: Record<string, unknown> = { leaf: 'bottom' };
    for (let depth = 0; depth < 100_000; depth++) value = { next: value };
    return value;
}

describe('an app logging through a Channels facade', () => {

    describe('the entry its write returns', () => {

        it('carries the context masked as a store with the default options masks it [dec-channels-facade-masks-what-it-exposes]', async () => {
            const storage = new ChannelsLogStorage('app', [{ storage: new MemoryLogStorage('memory') }]);

            const result = await storage.add({ type: 'info', message: 'signed in', context: signIn() });

            expect(result.ok).toBe(true);
            expect(result.entry?.context).toEqual(await maskedByDefault(signIn()));
            expect(JSON.stringify(result.entry)).not.toContain(PASSWORD);
            expect(JSON.stringify(result.entry)).not.toContain(API_KEY);
        });

        it('is masked when the write comes through a Logger [dec-channels-facade-masks-what-it-exposes]', async () => {
            const logger = new Logger(new ChannelsLogStorage('app', [{ storage: new MemoryLogStorage('memory') }]));
            const direct = await new Logger(new MemoryLogStorage('direct')).log('signed in', { password: PASSWORD });

            const result = await logger.log('signed in', { password: PASSWORD });

            expect(result.entry?.context).toEqual(direct.entry?.context);
            expect(JSON.stringify(result.entry)).not.toContain(PASSWORD);
        });

        it('is the entry each default channel recorded: same ulid, type, message and masked context [dec-channels-facade-masks-what-it-exposes]', async () => {
            const children = [new MemoryLogStorage('a'), new MemoryLogStorage('b')];
            const storage = new ChannelsLogStorage('app', children.map(child => ({ storage: child })));

            const result = await storage.add({ type: 'warn', message: 'signed in', context: signIn() });

            const exposed = { ulid: result.entry?.ulid, type: result.entry?.type, message: result.entry?.message, context: result.entry?.context };
            expect(exposed).toMatchObject({ type: 'warn', message: 'signed in' });
            for (const child of children) {
                const recorded = entriesOf(await child.get()).map(({ ulid, type, message, context }) => ({ ulid, type, message, context }));
                expect(recorded).toEqual([exposed]);
            }
        });

        it('leaves the caller\'s context as it was, and is a different object [dec-channels-facade-masks-what-it-exposes]', async () => {
            const context = signIn();
            const storage = new ChannelsLogStorage('app', [{ storage: new MemoryLogStorage('memory') }]);

            const result = await storage.add({ type: 'info', message: 'signed in', context });

            expect(context).toEqual(signIn());
            expect(result.entry?.context).not.toBe(context);
        });

        it('ignores masking options handed to the facade at run time [dec-channels-facade-masks-what-it-exposes]', async () => {
            const storage = new ChannelsLogStorage('app', [{ storage: new MemoryLogStorage('memory') }], {
                // @ts-expect-error a facade takes no masking options; ones handed over anyway must not loosen what it exposes
                permit_dangerous_context_properties: true,
                redact_sensitive_context_keys: false,
            });
            const context = () => ({ _dangerousToken: '123456789123456789', password: PASSWORD });

            const result = await storage.add({ type: 'info', message: 'm', context: context() });

            expect(result.entry?.context).toEqual(await maskedByDefault(context()));
            expect(result.entry?.context).toMatchObject({ _dangerousToken: '12...89' });
            expect(JSON.stringify(result.entry)).not.toContain(PASSWORD);
        });

        it('shows a value only a channel lists as sensitive when its shape looks harmless (known limit) [dec-channels-facade-masks-what-it-exposes]', async () => {
            const child = new MemoryLogStorage('memory', { sensitive_context_key_names: [...BUILT_IN_SENSITIVE_KEYS, 'myOrgToken'] });
            const storage = new ChannelsLogStorage('app', [{ storage: child }]);

            const result = await storage.add({ type: 'info', message: 'm', context: { myOrgToken: 'abc123' } });

            expect(entriesOf(await child.get()).map(entry => entry.context)).toEqual([{ myOrgToken: 'redact:sensitive-key' }]);
            expect(result.entry?.context).toEqual({ myOrgToken: 'abc123' });
        });
    });

    describe('its console echo', () => {

        it('prints the context masked as a store with the default options masks it [dec-channels-facade-masks-what-it-exposes]', async () => {
            const printed = recordConsoleLog();
            const storage = new ChannelsLogStorage('app', [{ storage: new MemoryLogStorage('memory') }], { log_to_console: true });

            await storage.add({ type: 'info', message: 'signed in', context: signIn() });

            expect(printed).toEqual([['[Log app] signed in', await maskedByDefault(signIn())]]);
            expect(JSON.stringify(printed)).not.toContain(PASSWORD);
            expect(JSON.stringify(printed)).not.toContain(API_KEY);
        });
    });

    describe('what each channel records', () => {

        it('is masked by that channel\'s own options and gate, while the facade exposes the default masking [dec-channels-facade-masks-what-it-exposes]', async () => {
            const flagged = new MemoryLogStorage('flagged', { allow_per_call_unmasking: true });
            const plain = new MemoryLogStorage('plain');
            const storage = new ChannelsLogStorage('app', [{ storage: flagged }, { storage: plain }]);

            const result = await storage.add({ type: 'info', message: 'm', context: { user: { id: UUID } } }, keepUserIdReadable);

            expect(entriesOf(await flagged.get()).map(entry => entry.context.user.id)).toEqual([UUID]);
            expect(entriesOf(await plain.get()).map(entry => entry.context.user.id)).toEqual([MASKED_UUID]);
            expect(result.entry?.context).toEqual({ user: { id: MASKED_UUID } });
        });
    });

    describe('a context nested too deeply to mask', () => {

        it('is exposed as the uncopyable marker, in the result and the echo, and the write is still ok [dec-channels-facade-masks-what-it-exposes]', async () => {
            const printed = recordConsoleLog();
            const storage = new ChannelsLogStorage('app', [{ storage: new MemoryLogStorage('memory') }], { log_to_console: true });

            const result = await storage.add({ type: 'warn', message: 'deep', context: nestedTooDeeplyToMask() });

            // Compared, not printed: a failure message would print the context 100,000 levels deep.
            const exposed: unknown = result.entry?.context;
            expect(result.ok).toBe(true);
            expect(exposed === 'redact:uncopyable').toBe(true);
            expect(printed.map(([line, context]) => [line, context === 'redact:uncopyable'])).toEqual([['[Log app] deep', true]]);
        });
    });
});
