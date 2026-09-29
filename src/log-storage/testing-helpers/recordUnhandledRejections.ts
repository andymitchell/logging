/**
 * The real `setImmediate`, captured when this module loads. A test file that fakes timers (e.g. the Webhook
 * suites) would otherwise leave `settled` waiting on a timer that never fires.
 */
const realSetImmediate = globalThis.setImmediate;

const DEFAULT_MACROTASK_LIMIT = 20;

/**
 * Records every promise rejection that nothing handled, from now until `stop()` is called.
 *
 * Logging must never leave a rejection unhandled, so every failure test asserts that this stays empty once
 * the work it started has settled.
 *
 * @returns
 * - `settled(until?)`: waits for pending work to settle, then resolves the rejection reasons recorded so far.
 *   It lets up to 20 macrotasks run, stopping sooner once `until()` returns true (use it when the work
 *   under test takes several macrotasks, e.g. fake-indexeddb).
 * - `stop()`: stops recording. Call it when the test finishes, e.g. with `onTestFinished`.
 *
 * @example
 * const unhandled = recordUnhandledRejections();
 * onTestFinished(unhandled.stop);
 * new Span(failingStorage);
 * expect(await unhandled.settled()).toEqual([]);
 */
export function recordUnhandledRejections(): { settled: (until?: () => boolean) => Promise<unknown[]>, stop: () => void } {
    const reasons: unknown[] = [];
    const record = (reason: unknown) => { reasons.push(reason); };
    process.on('unhandledRejection', record);

    return {
        async settled(until) {
            // Node reports an unhandled rejection only after the microtask queue drains, so at least two
            // macrotasks must pass before a rejection made by the latest work can be seen.
            for (let turn = 0; turn < DEFAULT_MACROTASK_LIMIT; turn++) {
                await new Promise<void>(resolve => realSetImmediate(resolve));
                if (turn >= 1 && until?.()) break;
            }
            return [...reasons];
        },
        stop() {
            process.off('unhandledRejection', record);
        },
    };
}
