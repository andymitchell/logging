import { describe, it, expect, onTestFinished, vi } from 'vitest';
import { MemoryBreakpoints } from '../breakpoints/MemoryBreakpoints.ts';
import type { LoggingFailure, LoggingOperation, LoggingResult } from '../failures/types.ts';
import type { LogStorageOptions } from './types.ts';
import { FailingLogStorage, type FailingHooks } from './testing-helpers/FailingLogStorage.ts';
import { recordFailures } from './testing-helpers/results.ts';
import { recordUnhandledRejections } from './testing-helpers/recordUnhandledRejections.ts';


/** A store whose own description of a failure (its `toFailure`) throws, whatever it is asked to describe. */
class StoreWithBrokenDescriptions extends FailingLogStorage {
    protected override toFailure(_operation: LoggingOperation, _cause: unknown): LoggingFailure {
        throw new Error('description bug');
    }
}

function breakpointsWithThrowingHandler() {
    const breakpoints = new MemoryBreakpoints();
    breakpoints.setHandler(() => { throw new Error('handler bug'); });
    void breakpoints.addBreakpoint({ type: 'warn' });
    return breakpoints;
}

type Scenario = {
    fail?: FailingHooks,
    options?: LogStorageOptions,
    call: (storage: StoreWithBrokenDescriptions) => Promise<LoggingResult>,
    failure: Pick<LoggingFailure, 'operation' | 'message'>,
};

const scenarios: [string, Scenario][] = [
    ['a write whose commit rejects', {
        fail: { commitEntry: { rejects: new Error('down') } },
        call: storage => storage.add({ type: 'info', message: 'fetched' }),
        failure: { operation: 'write', message: 'Could not record the entry.' },
    }],
    ['a read that throws', {
        fail: { queryEntries: { throws: new Error('down') } },
        call: storage => storage.get(),
        failure: { operation: 'read', message: 'Could not read the entries.' },
    }],
    ['a reset that rejects', {
        fail: { resetEntries: { rejects: new Error('down') } },
        call: storage => storage.reset(),
        failure: { operation: 'reset', message: 'Could not reset the entries.' },
    }],
    ['a clear of old entries that throws', {
        fail: { clearOldEntries: { throws: new Error('down') } },
        call: storage => storage.forceClearOldEntries(),
        failure: { operation: 'clear_old_entries', message: 'Could not clear old entries.' },
    }],
    ['a write whose breakpoint check throws', {
        options: { breakpoints: breakpointsWithThrowingHandler() },
        call: storage => storage.add({ type: 'warn', message: 'slow' }),
        failure: { operation: 'breakpoint', message: 'Could not check the entry against breakpoints.' },
    }],
];


describe('a store whose own description of a failure throws', () => {

    it.each(scenarios)('answers %s with its generic failure, tells its listeners, and throws nothing', async (_label, scenario) => {
        const unhandled = recordUnhandledRejections();
        onTestFinished(unhandled.stop);
        const storage = new StoreWithBrokenDescriptions('my-app', scenario.fail, scenario.options);
        const failures = recordFailures(storage);

        const result = await scenario.call(storage);

        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', ...scenario.failure }]);
        expect(failures.heard).toEqual([result.error]);
        expect(await unhandled.settled()).toEqual([]);
    });

    it('answers a write whose console echo throws with the echo failure', async () => {
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => { throw new Error('console broken'); });
        onTestFinished(() => consoleLog.mockRestore());
        const storage = new StoreWithBrokenDescriptions('my-app', {}, { log_to_console: true });

        const result = await storage.add({ type: 'warn', message: 'slow' });

        expect(result.error?.failures).toEqual([{ source: 'MemoryLogStorage:my-app', operation: 'write', message: 'Could not echo the entry to the console.' }]);
    });
});
