import type { z } from "zod";
import type { ILogStorage, LogStorageOptions } from "../log-storage/types.ts";
import type { LogStorageCapabilitiesSchema, MigrationChoiceSchema, SubstrateChoiceSchema } from "./schemas.ts";


/**
 * What the suite hands a harness factory: the inputs a store is constructed with. The factory forwards them
 * to the store's constructor.
 *
 * Each test picks the options its decision is about (e.g. `{ max_age: [{ max_ms: 60_000 }] }`), so one factory
 * is exercised across every configuration the decisions care about.
 */
export type LogStorageHarnessParams = {
    /**
     * Unique per harness: the suite appends a counter. A store keyed on it (an IndexedDB database name) never
     * shares its substrate with another harness's.
     */
    namespace: string;
    /** The configuration under test. */
    options?: LogStorageOptions;
};


/**
 * A backchannel to the substrate under a store (its array, its database), bypassing `add`, `get`, masking and
 * stamping. Supplied by the store's author, who alone knows the substrate.
 *
 * The suite uses it only where a decision speaks about what is persisted: to place records the store's own
 * doors would refuse (junk, entries from an older library) and to see what the store really holds.
 */
export interface RawLogAccess {
    /**
     * Every record on the substrate, minus any key the substrate itself assigned (IndexedDB's `id`), so a record
     * compares equal to the one written. Untrusted: narrow before use.
     */
    readAll(): Promise<unknown[]>;
    /** Place records straight onto the substrate, after those already there. Object-shaped only, since IndexedDB cannot hold a bare value. */
    writeAll(records: readonly Record<string, unknown>[]): Promise<void>;
}


/**
 * What a store does with entries an older library wrote. There is no "undeclared" arm: a harness must choose.
 * - `migrates`: clean-up upgrades them to the current format.
 * - `discards-old-entries`: clean-up removes them; `because` says why the store cannot upgrade them, and is
 *   shown as the reason whenever a migration test is skipped.
 */
export type MigrationChoice = z.infer<typeof MigrationChoiceSchema>;


/**
 * What is under the store. There is no "undeclared" arm: a harness must choose.
 * - `none`: keeps nothing (a console, a webhook). `get` is always `ok` and empty.
 * - `private`: keeps entries in a substrate that one instance owns for its lifetime (memory).
 * - `shared`: keeps entries in a substrate that several live instances can sit over at once (IndexedDB, a file,
 *   a server). `instance()` then mints a new store on every call, and the shared-substrate decisions bind it.
 */
export type SubstrateChoice = z.infer<typeof SubstrateChoiceSchema>;


/**
 * The facts about a store that decide which rules bind it. The suite checks each declaration it can (a store
 * that mints siblings must declare a shared substrate), so a wrong declaration fails rather than skips.
 */
export type LogStorageCapabilities = z.infer<typeof LogStorageCapabilitiesSchema>;


/**
 * A handle to one isolated substrate, written by the store's author and returned by their
 * {@link LogStorageHarnessFactory}. The suite builds a fresh one inside every test.
 *
 * @example
 * const harness: ImplLogStorageHarness = {
 *     capabilities: { substrate: { mode: 'private' }, migration: { mode: 'migrates' } },
 *     instance: async () => store,
 *     raw: { readAll: async () => store.readRaw(), writeAll: async records => store.writeRaw(records) },
 *     dispose: async () => {},
 * };
 */
export interface ImplLogStorageHarness {
    capabilities: LogStorageCapabilities;
    /**
     * A store over this harness's substrate, exactly as a consumer constructs it: not awaited and not warmed
     * up. The suite may call `get` or `add` on it straight away, and the store must answer only once its
     * construction clean-up is done (dec-start-up-clean-up-before-first-answer).
     *
     * With a `shared` substrate, every call constructs a new store over the same substrate. Otherwise every
     * call resolves the same store.
     */
    instance(): Promise<ILogStorage>;
    /** The backchannel to the substrate. Left out when it cannot be observed; the tests that need it then skip, saying so. */
    raw?: RawLogAccess;
    /** Release whatever the harness holds (a raw connection). The suite calls it once, when the test finishes. */
    dispose(): Promise<void>;
}


/**
 * How a store's author tells the suite to build one substrate and the stores over it. The factory prepares
 * the substrate (e.g. creates an IndexedDB database's schema) before it resolves, so raw access works at once.
 */
export type LogStorageHarnessFactory = (params: LogStorageHarnessParams) => Promise<ImplLogStorageHarness>;


/** What every group of decisions in the suite receives. */
export type LogStorageConformanceContext = { factory: LogStorageHarnessFactory };
