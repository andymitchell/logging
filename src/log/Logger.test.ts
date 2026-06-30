import { describe, it, expect } from 'vitest';
import { Logger } from './Logger.ts';
import { MemoryLogStorage } from '../log-storage/memory/MemoryLogStorage.ts';
import type { LogStorageOptions } from '../log-storage/types.ts';

/**
 * Each Logger method records an entry at its OWN level. The level is a routing/filtering contract:
 * consumers key on `type` to include stack traces (`include_stack_trace.debug`), drop debug in
 * production, or surface only errors. In particular `debug()` must record a `debug` entry — recording
 * it as `info` would make debug logs indistinguishable from ordinary info and impossible to filter out.
 */
describe('Logger records each call at its named level', () => {

    const makeLogger = (options?: LogStorageOptions) => new Logger(new MemoryLogStorage('t', options));

    it('debug() records a debug entry, not info', async () => {
        const entry = await makeLogger().debug('m', { a: 1 });
        expect(entry.type).toBe('debug');
    });

    it('log/warn/error/critical each record their matching level', async () => {
        const logger = makeLogger();
        expect((await logger.log('m')).type).toBe('info');
        expect((await logger.warn('m')).type).toBe('warn');
        expect((await logger.error('m')).type).toBe('error');
        expect((await logger.critical('m')).type).toBe('critical');
    });

    it('debugWithOptions() also records a debug entry (the per-call variant must match its plain twin)', async () => {
        const logger = new Logger(new MemoryLogStorage('t', { allow_per_call_unmasking: true }));
        const entry = await logger.debugWithOptions({ preserve_unmasked_context_paths: [] }, 'm', { a: 1 });
        expect(entry.type).toBe('debug');
    });

});
