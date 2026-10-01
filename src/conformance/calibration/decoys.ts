import { matchJavascriptObject, type WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { AcceptLogEntry, LogEntry } from "../../log-storage/types.ts";
import type { LogReadResult, LoggingResult, LogWriteResult } from "../../failures/types.ts";
import type { LogStorageCapabilities, LogStorageHarnessFactory } from "../harness-types.ts";
import { ok } from "../../failures/results.ts";
import createMaxAgeTest from "../../log-storage/createMaxAgeTest.ts";
import { decideCleanUp, isCurrentLogEntry, LOG_ENTRY_FORMAT_VERSION } from "../../log-storage/format/index.ts";
import { RawMemoryLogStorage } from "../../log-storage/memory/testing-helpers/RawMemoryLogStorage.ts";
import { SharedMemoryLogStorage } from "../../log-storage/memory/testing-helpers/SharedMemoryLogStorage.ts";
import { privateMemoryHarnessFactory, sharedMemoryHarnessFactory } from "../../log-storage/memory/testing-helpers/memoryHarnesses.ts";


/*
 * Stores that each break one rule (decoys), and correct stores (controls), for proving the suite can fail.
 * Test-only. Each decoy says which door it breaks.
 */


// --- Controls ---

/** A store over a shared substrate that discards entries from older libraries instead of upgrading them. */
class DiscardingMemoryLogStorage extends SharedMemoryLogStorage {
    protected override async clearOldEntries(): Promise<LoggingResult> {
        const isWithinMaxAge = createMaxAgeTest(this.maxAge);
        this._log = this._log.filter(record => decideCleanUp(record, isWithinMaxAge).action === 'keep');
        return ok();
    }
}


// --- The doors entries come in by ---

/** Breaks the add door: trusts whatever the caller hands it, unchecked, and lets the caller's fields win over the store's stamps. */
class AcceptsAnythingDecoy extends RawMemoryLogStorage {
    override async add<C>(acceptEntry: AcceptLogEntry<C>): Promise<LogWriteResult<C>> {
        const entry = { format_version: LOG_ENTRY_FORMAT_VERSION, timestamp: Date.now(), ulid: this.ulid(), ...acceptEntry };
        this.writeRaw([entry]);
        return { ok: true, entry: entry as LogEntry<C> };
    }
}

/** Breaks the reset door: appends whatever it is given, unchecked, instead of replacing what it holds. */
class ResetAppendsAnythingDecoy extends RawMemoryLogStorage {
    override async reset(entries?: LogEntry[]): Promise<LoggingResult> {
        this.writeRaw(Array.from(entries ?? []));
        return ok();
    }
}

/** Breaks opaque context and meta: hides an entry whose context or meta is not an object, as a record-shaped read check would. */
class HidesUnusualContextsDecoy extends RawMemoryLogStorage {
    protected override async queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
        const read = await super.queryEntries(filter, fullTextFilter);
        return { ...read, entries: read.entries.filter(entry => isAnObjectOrAbsent(entry.context) && isAnObjectOrAbsent(entry.meta)) };
    }
}

/** Breaks call order: commits each add after a delay that shrinks with every call, so later adds land first. */
class OutOfOrderAddDecoy extends RawMemoryLogStorage {
    #delay = 10;

    protected override async commitEntry(logEntry: LogEntry): Promise<LoggingResult> {
        const ticks = this.#delay;
        this.#delay = Math.max(0, ticks - 1);
        for( let tick = 0; tick < ticks; tick++ ) await Promise.resolve();
        return super.commitEntry(logEntry);
    }
}


// --- The read door ---

/** Breaks the read door: returns every record on its substrate, current or not. */
class LeakyReadDecoy extends RawMemoryLogStorage {
    protected override async queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
        let entries = structuredClone(this._log) as T[];
        if( filter ) entries = entries.filter(entry => matchJavascriptObject(entry, filter));
        if( fullTextFilter ) entries = entries.filter(entry => JSON.stringify(entry).includes(fullTextFilter));
        return { ok: true, entries };
    }
}

/** Breaks the read door: cleans up as it reads, so a read upgrades and removes records. */
class CleansUpOnReadDecoy extends RawMemoryLogStorage {
    protected override async queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
        await this.clearOldEntries();
        return super.queryEntries(filter, fullTextFilter);
    }
}


// --- The clean-up door ---

/** Breaks the clean-up door: removes aged entries it can read, and never upgrades or removes anything else. */
class NeverPurgesDecoy extends RawMemoryLogStorage {
    protected override async clearOldEntries(): Promise<LoggingResult> {
        const isWithinMaxAge = createMaxAgeTest(this.maxAge);
        this._log = this._log.filter(record => !isCurrentLogEntry(record) || isWithinMaxAge(record));
        return ok();
    }
}

/** Breaks the clean-up door: removes records a newer library wrote, as if it could not read them. */
class PurgesNewerRecordsDecoy extends RawMemoryLogStorage {
    protected override async clearOldEntries(): Promise<LoggingResult> {
        const isWithinMaxAge = createMaxAgeTest(this.maxAge);
        this._log = this._log.flatMap(record => {
            const decision = decideCleanUp(record, isWithinMaxAge);
            if( decision.action === 'replace' ) return [decision.entry];
            return decision.action === 'keep' && isCurrentLogEntry(record) ? [record] : [];
        });
        return ok();
    }
}


// --- Instances over a shared substrate ---

/** Breaks start-up convergence: adds each upgrade beside the record it upgrades, instead of rewriting that record. */
class DuplicatingCleanUpDecoy extends SharedMemoryLogStorage {
    protected override async clearOldEntries(): Promise<LoggingResult> {
        const isWithinMaxAge = createMaxAgeTest(this.maxAge);
        const kept: LogEntry[] = [];
        const upgrades: LogEntry[] = [];
        for( const record of this._log ) {
            const decision = decideCleanUp(record, isWithinMaxAge);
            if( decision.action === 'keep' ) kept.push(record);
            if( decision.action === 'replace' ) {
                kept.push(record);
                upgrades.push(decision.entry);
            }
        }
        this._log = [...kept, ...upgrades];
        return ok();
    }
}

/** Breaks start-up ordering: answers its first read from the substrate as it found it, and only then cleans up. */
class AnswersBeforeCleanUpDecoy extends SharedMemoryLogStorage {
    #cleanedUp = false;

    protected override startUpCleanUp(): void {
        // Put off until the first read has been answered.
    }

    protected override async queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
        const read = await super.queryEntries(filter, fullTextFilter);
        if( !this.#cleanedUp ) {
            this.#cleanedUp = true;
            await this.clearOldEntries();
        }
        return read;
    }
}

/** Breaks visibility: works on a copy of the shared substrate taken when it was constructed, so it never sees another writer, nor shows its own writes. */
class SnapshotOnConstructDecoy extends SharedMemoryLogStorage {
    constructor(...args: ConstructorParameters<typeof SharedMemoryLogStorage>) {
        super(...args);
        Object.defineProperty(this, '_log', { value: [...this._log], writable: true });
    }
}


/**
 * Every harness the calibration checks every claim against. The controls are correct and must pass every claim
 * that binds them; each decoy must fail the claims of the rule it breaks.
 */
export const CALIBRATION_HARNESSES = {
    memory: privateMemoryHarnessFactory(),
    sharedMemory: sharedMemoryHarnessFactory(),
    discardingMemory: withCapabilities(
        sharedMemoryHarnessFactory((namespace, substrate, options) => new DiscardingMemoryLogStorage(namespace, substrate, options)),
        { substrate: { mode: 'shared' }, migration: { mode: 'discards-old-entries', because: 'Calibration control for discarding stores.' } },
    ),
    acceptsAnything: privateMemoryHarnessFactory((namespace, options) => new AcceptsAnythingDecoy(namespace, options)),
    resetAppendsAnything: privateMemoryHarnessFactory((namespace, options) => new ResetAppendsAnythingDecoy(namespace, options)),
    hidesUnusualContexts: privateMemoryHarnessFactory((namespace, options) => new HidesUnusualContextsDecoy(namespace, options)),
    outOfOrderAdd: privateMemoryHarnessFactory((namespace, options) => new OutOfOrderAddDecoy(namespace, options)),
    leakyRead: privateMemoryHarnessFactory((namespace, options) => new LeakyReadDecoy(namespace, options)),
    cleansUpOnRead: privateMemoryHarnessFactory((namespace, options) => new CleansUpOnReadDecoy(namespace, options)),
    neverPurges: privateMemoryHarnessFactory((namespace, options) => new NeverPurgesDecoy(namespace, options)),
    purgesNewerRecords: privateMemoryHarnessFactory((namespace, options) => new PurgesNewerRecordsDecoy(namespace, options)),
    duplicatingCleanUp: sharedMemoryHarnessFactory((namespace, substrate, options) => new DuplicatingCleanUpDecoy(namespace, substrate, options)),
    answersBeforeCleanUp: sharedMemoryHarnessFactory((namespace, substrate, options) => new AnswersBeforeCleanUpDecoy(namespace, substrate, options)),
    snapshotOnConstruct: sharedMemoryHarnessFactory((namespace, substrate, options) => new SnapshotOnConstructDecoy(namespace, substrate, options)),
    // Breaks the declared choice: upgrades older entries while declaring it discards them.
    migratesButDeclaresDiscarding: withCapabilities(
        sharedMemoryHarnessFactory(),
        { substrate: { mode: 'shared' }, migration: { mode: 'discards-old-entries', because: 'A declaration the store does not back.' } },
    ),
    // Breaks the declared choice: builds a new store on every instance() while declaring a private substrate.
    undeclaredSiblings: withCapabilities(sharedMemoryHarnessFactory(), { substrate: { mode: 'private' }, migration: { mode: 'migrates' } }),
    // Breaks the declared choice: says nothing about older entries, as a JavaScript harness can.
    forgottenMigrationChoice: withCapabilities(privateMemoryHarnessFactory(), forgottenChoice({ substrate: { mode: 'private' } })),
} satisfies Record<string, LogStorageHarnessFactory>;


/** `factory`, declaring `capabilities` in place of its own. */
function withCapabilities(factory: LogStorageHarnessFactory, capabilities: LogStorageCapabilities): LogStorageHarnessFactory {
    return async params => ({ ...await factory(params), capabilities });
}

/** Capabilities with a choice left out, which the type forbids. */
function forgottenChoice(capabilities: Pick<LogStorageCapabilities, 'substrate'>): LogStorageCapabilities {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a declaration the type forbids is what is under test
    return capabilities as any;
}

function isAnObjectOrAbsent(value: unknown): boolean {
    return value === undefined || (typeof value === 'object' && value !== null && !Array.isArray(value));
}
