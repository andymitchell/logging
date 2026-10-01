import { onTestFinished, vi } from 'vitest';
import type { LogStorageOptions } from "../../log-storage/types.ts";


/** An hour, in milliseconds: old enough for {@link KEPT_FOR_A_MINUTE} to remove. */
export const AN_HOUR = 3_600_000;

/** Options under which a store keeps entries for a minute, so an entry {@link AN_HOUR} old is due for removal. */
export const KEPT_FOR_A_MINUTE: LogStorageOptions = { max_age: [{ max_ms: 60_000 }] };


/**
 * Stop the clock the stores read at midnight on 1 January 2026 (UTC), for the rest of the test, so every run
 * sees the same time. Timers keep running, so a store that waits on them (IndexedDB, a webhook) works as usual.
 */
export function freezeClock(): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 0, 1));
    onTestFinished(() => { vi.useRealTimers(); });
}
