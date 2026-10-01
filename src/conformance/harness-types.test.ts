import { describe, expectTypeOf, it } from 'vitest';
import type { ILogStorage } from "../log-storage/types.ts";
import type { ImplLogStorageHarness, LogStorageCapabilities, LogStorageHarnessFactory, MigrationChoice, RawLogAccess, SubstrateChoice } from "./harness-types.ts";
import { runLogStorageConformance } from "./index.ts";
import { MemoryLogStorage } from "../log-storage/memory/MemoryLogStorage.ts";


describe('what a store\'s author can declare [dec-conformance-declared-choices]', () => {

    it('offers exactly three substrates, and no way to leave the choice out [dec-conformance-declared-choices]', () => {
        expectTypeOf<SubstrateChoice['mode']>().toEqualTypeOf<'none' | 'private' | 'shared'>();

        // @ts-expect-error a substrate must be chosen
        const forgotten: SubstrateChoice = {};
        // @ts-expect-error "retains" is not a substrate: say whether instances share it
        const vague: SubstrateChoice = { mode: 'retains' };
        expectTypeOf([forgotten, vague]).toBeArray();
    });

    it('lets a store discard older entries only with a reason, and offers no way to leave the choice out [dec-conformance-declared-choices]', () => {
        expectTypeOf<MigrationChoice>().toEqualTypeOf<{ mode: 'migrates' } | { mode: 'discards-old-entries', because: string }>();

        // @ts-expect-error a migration choice must be made
        const forgotten: MigrationChoice = {};
        // @ts-expect-error discarding needs a reason
        const unexplained: MigrationChoice = { mode: 'discards-old-entries' };
        expectTypeOf([forgotten, unexplained]).toBeArray();
    });

    it('declares capabilities only through the two choices [dec-conformance-declared-choices]', () => {
        const capabilities: LogStorageCapabilities = {
            substrate: { mode: 'private' },
            migration: { mode: 'migrates' },
            // @ts-expect-error a flag would have an undeclared default; the substrate choice says it
            retainsEntries: true,
        };
        const reopenable: LogStorageCapabilities = {
            substrate: { mode: 'shared' },
            migration: { mode: 'migrates' },
            // @ts-expect-error survival across instances is what a shared substrate means
            survivesReopen: true,
        };
        expectTypeOf([capabilities, reopenable]).toBeArray();
    });

    it('settles every substrate in an exhaustive switch [dec-conformance-declared-choices]', () => {
        const describeSubstrate = (substrate: SubstrateChoice): string => {
            switch( substrate.mode ) {
                case 'none': return 'keeps nothing';
                case 'private': return 'owned by one store';
                case 'shared': return 'shared by siblings';
                default: {
                    const unhandled: never = substrate;
                    return unhandled;
                }
            }
        };
        expectTypeOf(describeSubstrate).returns.toEqualTypeOf<string>();
    });
});


describe('what the suite asks of a store\'s author [dec-conformance-harness-factory]', () => {

    it('runs from a factory of harnesses, not of stores [dec-conformance-harness-factory]', () => {
        expectTypeOf(runLogStorageConformance).parameter(0).toEqualTypeOf<LogStorageHarnessFactory>();

        const registerFromAStoreFactory = () => {
            // @ts-expect-error a bare store factory cannot show siblings, raw access or capabilities
            runLogStorageConformance(async () => new MemoryLogStorage('my-app'));
        };
        expectTypeOf(registerFromAStoreFactory).toBeFunction();
    });

    it('hands back stores as their interface [dec-conformance-harness-factory]', () => {
        expectTypeOf<Awaited<ReturnType<ImplLogStorageHarness['instance']>>>().toEqualTypeOf<ILogStorage>();
    });

    it('offers no way to fake a failure inside the store [dec-conformance-harness-factory]', () => {
        const crash = (harness: ImplLogStorageHarness) => {
            // @ts-expect-error a simulated crash proves the hook, not the store
            harness.simulateCrash();
        };
        expectTypeOf(crash).toBeFunction();
    });
});


describe('raw access to the substrate [dec-conformance-raw-only-for-substrate-claims]', () => {

    it('reads records as untrusted values, to be narrowed before use [dec-conformance-raw-only-for-substrate-claims]', () => {
        expectTypeOf<Awaited<ReturnType<RawLogAccess['readAll']>>>().toEqualTypeOf<unknown[]>();
    });

    it('writes only object-shaped records [dec-conformance-raw-only-for-substrate-claims]', () => {
        const writeABareValue = (raw: RawLogAccess) => {
            // @ts-expect-error IndexedDB cannot hold a bare value, so no substrate is asked to
            raw.writeAll([42]);
        };
        expectTypeOf(writeABareValue).toBeFunction();
    });

    it('is optional, for a substrate that cannot be observed [dec-conformance-raw-only-for-substrate-claims]', () => {
        expectTypeOf<ImplLogStorageHarness['raw']>().toEqualTypeOf<RawLogAccess | undefined>();
    });
});
