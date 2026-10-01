import { expect } from 'vitest';
import type { LogEntry } from "../../log-storage/types.ts";
import type { ImplLogStorageHarness, RawLogAccess } from "../harness-types.ts";


/**
 * What identifies each entry and its format: enough to tell which entries a store holds, and in what order,
 * without comparing every field. A claim about whole entries compares them whole.
 */
export function identities(entries: readonly LogEntry[]): Pick<LogEntry, 'ulid' | 'message' | 'timestamp' | 'format_version'>[] {
    return entries.map(({ ulid, message, timestamp, format_version }) => ({ ulid, message, timestamp, format_version }));
}

/** {@link identities}, ordered by ulid, for comparing entries whose order is not the point. */
export function identitiesByUlid(entries: readonly LogEntry[]): Pick<LogEntry, 'ulid' | 'message' | 'timestamp' | 'format_version'>[] {
    return identities([...entries].sort((a, b) => a.ulid.localeCompare(b.ulid)));
}

/** The ulid of each entry, in order. */
export function ulidsOf(entries: readonly LogEntry[]): string[] {
    return entries.map(entry => entry.ulid);
}

/**
 * Check the substrate holds exactly `expected`, in any order: nothing missing, nothing extra, nothing twice.
 * `expected` may hold asymmetric matchers, e.g. `expect.objectContaining({ ulid })`.
 */
export async function expectSubstrateHolds(raw: RawLogAccess, expected: readonly unknown[]): Promise<void> {
    const held = await raw.readAll();
    expect(held).toHaveLength(expected.length);
    expect(held).toEqual(expect.arrayContaining([...expected]));
}

/** Whether the store keeps the entries it is given, and so can show them to a read. */
export function keepsEntries(harness: ImplLogStorageHarness): boolean {
    return harness.capabilities.substrate.mode !== 'none';
}

/**
 * What clean-up leaves of entries an older library wrote: `upgraded` for a store that migrates them, nothing
 * for one that discards them.
 */
export function survivingUpgrades(harness: ImplLogStorageHarness, upgraded: readonly LogEntry[]): LogEntry[] {
    return harness.capabilities.migration.mode === 'migrates' ? [...upgraded] : [];
}

/** The harness's backchannel. Only for a claim gated on there being one. */
export function rawOf(harness: ImplLogStorageHarness): RawLogAccess {
    if( !harness.raw ) throw new Error('This claim must be gated on raw access to the substrate.');
    return harness.raw;
}
