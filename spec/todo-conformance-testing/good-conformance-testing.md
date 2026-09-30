# How to create a conformance test suite for any library

Distilled from `store2/src/conformance/` (the `ICollection` conformance runner). The final section
applies it to `ILogStorage` in `@andymitchell/logging`.

---

## 1. The concept

A library often has **one interface with many implementations**: an in-memory store, an IndexedDB store, a
SQL store, a proxy over HTTP. Each implementation promises the same behaviour. That behaviour is written
down once, as numbered decisions in a spec (`spec/decisions.md`, `### dec-<slug>`).

A **conformance suite** is one set of tests, written once against the interface, that any implementation
can run to prove it keeps those promises. The suite does not know which implementation it is testing. The
implementation hands the suite a **factory** ("here is how to build one of me"), and the suite builds a
fresh one inside every test.

```
spec/decisions.md ──(each dec-slug becomes tests)──► conformance suite
                                                          │
            memory.test.ts   ──runConformance(memoryFactory)──┤
            idb.test.ts      ──runConformance(idbFactory)─────┤
            webhook.test.ts  ──runConformance(webhookFactory)─┘
```

What you gain:
- **One definition of "correct".** A new implementation gets the full battery in one line.
- **Safe composition.** Layers that wrap other layers (proxies, fan-outs, caches) can trust any conformant
  implementation instead of defensively re-checking its outputs.
- **Traceability.** Every test names the `dec-slug` it proves, so "which decisions are tested?" can be
  answered mechanically.
- **Drift is caught.** An implementation that quietly diverges from the spec fails the shared tests, not
  just its own.

The suite covers **what every implementation must do**. Each implementation still keeps its own tests for
what only it does (IndexedDB version upgrades, webhook retry back-off).

---

## 2. The parts

| Part | What it is | In store2 |
|---|---|---|
| **Spec decisions** | Numbered, slugged rules with examples | `spec/spec.md` `dec-*` |
| **Runner** | Public entry point: `runXConformance(factory, options)`. Registers a `describe` and wires every cluster | `conformance/index.ts` |
| **Harness factory** | Implementer-supplied `(params) => Promise<Harness>` | `IHarnessFactory<T>` |
| **Harness** | What the factory returns: mints instances over one substrate, gives raw access, tears down | `ImplHarness<T>` → `IHarness<T>` |
| **`createHarness`** | Wraps the implementer's harness and adds the universal helpers (fault injection, delays, seed-once) | `conformance/harness.ts` |
| **Decision clusters** | One folder per spec area, each exporting `run<Cluster>Decisions(ctx)` | `conformance/decisions/<cluster>/` |
| **Context** | What every cluster receives: factory + fixtures + options | `ConformanceContext<T>` |
| **Test helpers** | `freshHarness`, result unwrappers, timing, event capture | `conformance/helpers/` |
| **Environment** | Deterministic fakes: frozen clock, scripted upstreams | `conformance/environment/` |
| **Calibration** | Deliberately broken implementations that MUST fail the suite | `conformance/calibration/` |
| **Type tests** | Pins the public surface, including seams you deliberately did not add | `conformance/type-tests/` |

### 2.1 Factory vs harness

A plain factory (`() => instance`) is enough for single-instance tests. It is not enough for:
- **Cross-instance behaviour.** Two instances over the same storage must see each other's writes.
- **Durability / reopen.** Dispose an instance, build a new one over the same data, and it must still be
  there.
- **Arranging and inspecting the real storage** without going through the interface under test.

So the factory returns a **harness**: a handle to one isolated piece of storage (the *substrate*) that can
mint any number of instances over it.

```ts
type HarnessFactory<P> = (params: P) => Promise<ImplHarness>;

interface ImplHarness {
  instance(): Promise<IThing>;   // a NEW instance over this harness's substrate, every call
  dispose(): Promise<void>;      // tear down the substrate; idempotent
  raw: RawAccess;                // bypass the interface: read/write the substrate directly
}
```

Rules that make it work:
- **One harness owns one substrate.** Two harnesses never share storage, even if given equal ids. The
  suite relies on this to test isolation.
- **Siblings from one harness share it** (when the implementation claims sharing). Cross-instance tests use
  a second `instance()`, never a special hook.
- **A fresh harness per test**, built lazily inside the `it` body, never at registration time. Tear it
  down with `onTestFinished(() => harness.dispose())`.
- **Unique ids per harness.** A `freshHarness(ctx)` helper appends a monotonic counter to the id, so an
  implementation keyed on the id (a database name) never aliases two harnesses. No clock or randomness:
  replays stay stable.

### 2.2 Two parameter channels

Keep these apart:
- **Channel A: construction inputs** (`HarnessParams`). The suite chooses them and the factory forwards
  them to the constructor: id, config options, an injected recording logger, small thresholds so slow
  paths run fast in tests.
- **Channel B: runner options** (`runXConformance(factory, options)`). Test-only declarations the
  implementation never sees: which optional batteries to run, fixtures for a fixed-shape implementation,
  opt-outs.

Config variations (e.g. `{ max_age: 1 min }`, `{ allow_per_call_unmasking: true }`) belong in Channel A.
**The test chooses the config and builds the instance with it.** This is how one factory is exercised
across every option combination the decisions care about.

### 2.3 Raw access: the backchannel

Some decisions are only provable by looking underneath the interface:
- **Arrange** a state the interface cannot produce: entries with old timestamps, corrupt rows, rows
  written by an older version.
- **Assert** what was really persisted, not what the read path returns. "The secret never reached disk" is
  a different claim from "`get` returns it masked".

The implementer provides raw access in the harness, because only it knows the substrate. Guidance:
- Use raw access **only where a decision speaks about the substrate** (what is persisted, what survives,
  what junk is tolerated). Everything else goes through the public interface, or the suite ends up testing
  implementation details.
- Return raw reads as `unknown` and narrow them with a schema. A raw read is untrusted data.
- store2 splits it: `seed` (arrange) lives on `ImplHarness` only and `createHarness` calls it exactly once
  per harness, on first mint. Tests never see it. Raw reads are exposed only to batteries that need them
  (the KV battery's `rawSubstrateAccess`). A smaller library can expose `raw` to tests directly, as long as
  the rule above holds.
- Substrates with nothing to read (a console, a remote webhook) either expose what they *can* observe (the
  captured console calls, the requests the fake server received) or declare `raw: undefined`, and the tests
  that need it skip visibly.

### 2.4 Universal helpers added by `createHarness`

Behaviour every implementation gets for free, added at the **public boundary** (via `vi.spyOn`), never by
reaching inside:
- `simulateNextCallFailure(target, method, override?)`. The next call returns an error value, throws,
  rejects, or resolves garbage. Used to test that *wrappers* handle a failing inner layer.
- `delayNextCall(target, method, { deferred: true })` returns `{ release() }` and holds a call open, so
  tests can drive disposal or concurrency around an in-flight call deterministically.

Deliberately **not** added: `simulateCrash`, `pauseMidWrite`, "swap in a mock substrate". Those are
unprovable and breed false confidence. Tests that truly need a substrate-specific failure (killing a
Postgres backend, a 503 from a mock HTTP client) live in the implementation's own test file, marked in the
spec as `#UNIVERSAL_RULE_IMPL_TEST`: the rule is universal, the test is per-implementation. Pin these
absences with `@ts-expect-error` type tests (§2.9).

### 2.5 Decision clusters

Mirror the spec's structure in the file tree:

```
conformance/
  index.ts                     runner (wires clusters only; no assertions)
  harness-types.ts             types only
  harness.ts                   createHarness + boundary helpers
  helpers/                     freshHarness, results, timing, fixtures
  decisions/
    writes/index.ts            runWritesDecisions(ctx)
    reads/index.ts             runReadsDecisions(ctx)
    failures/index.ts          runFailureDecisions(ctx)
  calibration/                 decoys + meta-tests
  type-tests/                  *.test-d.ts
```

Each cluster is `describe('[dec-slug] plain-English rule', …)` with `it('outcome [dec-slug]', …)`. Put the
slug in the test name: it makes coverage greppable, and a coverage map can later be generated from the spec
plus the tagged tests. Put a one-line comment above each `it` quoting the rule it proves.

### 2.6 Capability gating: skip visibly, never silently

Not every decision applies to every implementation (a console store keeps no entries; only sharing stores
have cross-instance behaviour). Two mechanisms:

1. **Runtime introspection.** Read capabilities from the live instance (`meta`, type guards such as
   `isBackingStore(x)`) and call Vitest's `skip(reason)` when they don't apply. Don't ask for an
   `expectedMeta` option: a second copy of the facts can drift from the first.
2. **Declared choices that cannot be forgotten.** When a battery is optional but important, make the
   runner option a discriminated union with no "absent" arm:
   ```ts
   type KvChoice =
     | { mode: 'run'; factories: readonly [Entry, ...Entry[]] }   // non-empty tuple: an empty run can't compile
     | { mode: 'opt-out'; certifiedBy: string; verifiedVia: 'pre-tested-package' | 'manual-tests' };
   ```
   If the instance has the capability and the option is `undefined`, the runner fails a test ("forgotten,
   not opted out"). An honoured opt-out shows up as a skip that carries its justification. Validate the
   choice at runtime too, for JavaScript or cast callers.

A skip always carries a reason naming what is owed, e.g. "the implementation must cover this in its own
tests".

### 2.7 Fixtures

- **Suite-owned standard fixture** (default): the suite defines the test data shape and a `facts` object
  (`mintRow(n)`, which fields are dates, …). Tests build data only through `facts`, never literals, so a
  second fixture source can be swapped in.
- **Locked-shape implementations** (a Gmail bridge can't accept arbitrary shapes) supply their own
  `standardParams: { schema, facts }` through a separate overload. Batteries that need a suite-chosen shape
  skip with "owes a shape-specific fork".
- **Mint fresh per build.** `mintParams()` returns fresh clones and a fresh logger each time, so harnesses
  never share mutable fixtures.

Skip this whole layer if your interface has no user-defined data shape.

### 2.8 Composites / stackables

If implementations wrap other implementations (proxies, fan-outs), add a second entry point:

```ts
runStackableConformance(stackableFactory, { upstreamFactory });
```

It (a) builds a stack over a real upstream and runs **the whole base battery through the stack**, then (b)
runs stackable-only batteries: upstream failures are normalised, not relayed raw; nothing leaks; parity
with the upstream. Require a real `upstreamFactory` with no fake default, because the layer's behaviour is
defined by what it does with a real upstream. Build stacks with background machinery off (`'none'`) for
exact-count tests, and on (`'live'`) only for propagation tests.

### 2.9 Calibration: prove the suite can fail

A green run proves nothing if the assertion couldn't have failed. For each high-risk decision:
- Write a **decoy**: a decorator over a real implementation that breaks **exactly one** rule (acknowledges
  writes but drops them; persists what it should not).
- Write a **positive control**: the unmodified real implementation.
- Put the assertion in a reusable function (`assertX(harness)`) and have a meta-test run every decoy
  through every assertion against a declared **outcome matrix**: the decoy fails its own assertion, passes
  the unrelated ones (a single-fault proof), and the positive control passes all of them.

Decoys are test-only. Never export them from the package barrel.

### 2.10 Type tests

`*.test-d.ts` checked with `tsc --noEmit` / `expectTypeOf`:
- The public surface is exact (`Expect<Equal<…>>`); overloads resolve correctly (a locked overload *requires*
  `standardParams`; the unlocked one forbids it with `?: never`).
- **Negative pins**: `// @ts-expect-error no simulateCrash on IHarness`. Stops a later refactor from
  quietly adding a rejected seam.
- The one sanctioned cast (if any) is quarantined and pinned.

### 2.11 Determinism

- Fake the clock (`vi.useFakeTimers({ toFake: ['Date'] })`) for anything time-based. Leave real timers
  running if the substrate needs them.
- Use deferred gates (`release()`), not sleeps, for ordering.
- Load/race tests are statistical and gated to implementations that can bear load. Declare a fuzz budget
  instead of silently lowering iterations, and surface it as a visible skip.

### 2.12 Obligations outside the code

- Each implementation's README commits: "passes `runXConformance` plus its own bespoke tests". Stackers
  rely on that commitment.
- Record conformance-suite design choices as decisions too (`dec-conformance-*`), so the suite has a spec
  of its own.

---

## 3. Build order

1. **Slug the spec.** Every rule is a `dec-<slug>` with an example (ideally the averted failure).
2. **Types first** (`harness-types.ts`): `HarnessParams`, `ImplHarness`, `IHarness`, `HarnessFactory`,
   runner options, capability declarations.
3. **`createHarness` + `freshHarness`.** Test them (`harness.test.ts`): seed-once under concurrent first
   mints, unique ids, idempotent dispose.
4. **The runner** with one cluster. Wire the simplest implementation (in-memory) and get it green.
5. **Clusters one decision at a time**, test by test (TDD): one `it`, run it against every wired
   implementation, then the next.
6. **Wire the remaining implementations.** Each failure is either a real bug or a gating fact you missed.
7. **Calibrate** the high-risk decisions with decoys.
8. **Type tests** for the surface and the rejected seams.
9. **Stackable entry**, if you have composites.

Pitfalls seen in store2:
- Building harnesses at registration time (`describe` body): runs I/O even when the suite is skipped.
- Constant ids aliasing substrates, which only shows up on durable implementations.
- A silent `return` instead of `skip(reason)`: the test reports green having proven nothing.
- Hooks that reach inside the implementation: they test the hook, not the implementation.
- Assertions on presence (`toBeDefined`) rather than values.

---

## 4. Worked example: `ILogStorage` in `@andymitchell/logging`

### 4.1 Where this repo is today

`src/log-storage/testing-helpers/common.ts` already has a proto-suite:

```ts
type CreateTestLogger = (options?: LogStorageOptions) => {
  logger: ILogStorage;
  cannot_recreate_with_same_data?: boolean;
  recreateWithSameData: () => ILogStorage;
};
commonLogStorageTests(createLogger);   // wired by Memory, IDB, Webhook, Channels test files
```

That is a factory with config options, plus a reopen hook. What's missing, by the guide:
- No raw access. Aged entries are arranged through the public `reset()`, and nothing asserts what was
  persisted.
- Capabilities are ad-hoc flags (`cannot_recreate_with_same_data`) rather than declared and skipped
  visibly.
- Tests aren't tagged or organised by `dec-slug`.
- Failure behaviour (`dec-logging-never-breaks-control-flow`, `dec-failures-as-values`) lives in separate
  per-feature files instead of running against every store.
- No calibration.

### 4.2 Types (`src/log-storage/conformance/harness-types.ts`)

```ts
import type { ILogStorage, LogEntry, LogStorageOptions } from '../types.ts';

/** Channel A — what the suite passes to the factory; forwarded to the store's constructor. */
export type LogStorageHarnessParams = {
  /** Unique per harness (freshHarness appends a counter). Names the substrate, e.g. the IDB database. */
  namespace: string;
  /** The config under test. Each test picks the options its decision is about. */
  options?: LogStorageOptions;
};

/** Direct access to the substrate, bypassing add/get/masking/stamping. */
export interface RawLogAccess {
  /** Every record exactly as persisted. Untrusted: narrow with LogEntrySchema before use. */
  readAll(): Promise<unknown[]>;
  /** Place records straight onto the substrate (no ulid/timestamp stamping, no masking, no validation). */
  writeAll(records: readonly unknown[]): Promise<void>;
}

/** Facts the batteries gate on. Declared by the implementer; verified where cheap. */
export type LogStorageCapabilities = {
  /** get() returns what was added. false for Console/Webhook (dec-stores-that-retain-nothing-answer-empty). */
  retainsEntries: boolean;
  /** A fresh instance() over the same harness sees earlier entries (IDB: true; Memory: false). */
  survivesReopen: boolean;
};

/** What the implementer writes. */
export interface ImplLogStorageHarness {
  capabilities: LogStorageCapabilities;
  /** A new store over this harness's substrate. Siblings share it when survivesReopen is true. */
  instance(): Promise<ILogStorage>;
  /** Absent when the substrate cannot be observed; raw-dependent tests then skip with a reason. */
  raw?: RawLogAccess;
  dispose(): Promise<void>;
}

export type LogStorageHarnessFactory = (params: LogStorageHarnessParams) => Promise<ImplLogStorageHarness>;

/** What tests see: the impl harness plus universal boundary helpers. */
export interface ILogStorageHarness extends ImplLogStorageHarness {
  simulateNextCallFailure(target: ILogStorage, method: 'add' | 'get' | 'reset' | 'forceClearOldEntries',
    failure: { raw: 'throw' | 'reject'; error: unknown } | { raw: 'resolve'; value: unknown }): void;
}
```

`simulateNextCallFailure` is for **wrappers** (`Logger`, `Span`, `ChannelsLogStorage` over a child). It
proves they turn a misbehaving store into a value (`dec-classify-failure-once-at-origin`,
`dec-channels-isolate-channels`). It is not for proving a leaf store's own failure handling, because the
spy replaces the method under test. That belongs in the store's own file (the existing
`IDBLogStorage-failures.test.ts`), i.e. `#UNIVERSAL_RULE_IMPL_TEST`.

### 4.3 Runner (`src/log-storage/conformance/index.ts`)

```ts
export type LogStorageConformanceContext = { factory: LogStorageHarnessFactory };

/**
 * Registers the ILogStorage conformance suite: every spec decision a store must keep, run against
 * stores built by `factory`.
 */
export function runLogStorageConformance(factory: LogStorageHarnessFactory): void {
  describe('ILogStorage conformance', () => {
    const ctx = { factory };
    runWriteDecisions(ctx);          // dec-awaited-write-means-recorded, dec-out-of-band-directive-transport
    runMaskingDecisions(ctx);        // dec-key-based-redaction, dec-allow-per-call-unmasking-gate, …
    runRetentionDecisions(ctx);      // max_age, dec-stores-that-retain-nothing-answer-empty
    runFailureDecisions(ctx);        // dec-logging-never-breaks-control-flow, dec-failures-as-values, …
    runListenerDecisions(ctx);       // dec-failure-signal-in-memory, dec-listener-writes-never-deliver
  });
}

/** Composite stores (Channels) additionally run the base suite through the facade. */
export function runLogStorageStackableConformance(
  stackableFactory: (params: LogStorageHarnessParams, children: ILogStorage[]) => Promise<ImplLogStorageHarness>,
  { childFactory }: { childFactory: LogStorageHarnessFactory },
): void { /* base battery through the facade + channel-isolation batteries */ }
```

`helpers/fresh-harness.ts`:

```ts
let seq = 0;
export async function freshHarness(ctx: LogStorageConformanceContext, options?: LogStorageOptions) {
  const harness = createHarness(await ctx.factory({ namespace: `conformance-${++seq}`, options }));
  onTestFinished(() => harness.dispose());
  return harness;
}
```

### 4.4 A cluster using raw read/write (`decisions/masking/index.ts`)

```ts
export function runMaskingDecisions(ctx: LogStorageConformanceContext): void {

  describe('[dec-key-based-redaction] a sensitive key is redacted before it is stored', () => {
    // The secret must never reach the substrate, not merely be hidden on read.
    it('persists the marker, never the value [dec-key-based-redaction]', async ({ skip }) => {
      const h = await freshHarness(ctx);
      if (!h.raw) return skip('Substrate not observable: the store must prove this in its own tests');
      const store = await h.instance();
      const secret = 'Password1';

      await store.add({ type: 'info', message: 'm', context: { password: secret } });

      const persisted = JSON.stringify(await h.raw.readAll());
      expect(persisted).not.toContain(secret);
      expect(persisted).toContain('redact:sensitive-key');
    });
  });

  describe('[dec-out-of-band-directive-transport] per-call options are never persisted', () => {
    it('stores no directive keys anywhere in the record [dec-out-of-band-directive-transport]', async ({ skip }) => {
      const h = await freshHarness(ctx, { allow_per_call_unmasking: true });
      if (!h.raw) return skip('Substrate not observable');
      const store = await h.instance();

      await store.add({ type: 'info', message: 'm', context: { user: { id: UUID } } },
        { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] });

      const persisted = JSON.stringify(await h.raw.readAll());
      expect(persisted).not.toMatch(/preserve_unmasked_context_paths|allow_per_call_unmasking/);
      expect(persisted).toContain(UUID); // …and the directive was honoured, so the test isn't vacuous
    });
  });

  describe('[dec-allow-per-call-unmasking-gate] per-call unmasking is off unless the store opts in', () => {
    // Property: for the same entry and directive, output differs only by the flag.
    it.each([[true, true], [false, false], [undefined, false]])(
      'allow_per_call_unmasking=%s → preserved=%s [dec-allow-per-call-unmasking-gate]',
      async (flag, preserved, { skip }) => {
        const h = await freshHarness(ctx, { allow_per_call_unmasking: flag });
        if (!h.capabilities.retainsEntries) return skip('Retains nothing to read back');
        const store = await h.instance();
        await store.add({ type: 'info', message: 'm', context: { user: { id: UUID } } },
          { preserve_unmasked_context_paths: [{ path: 'user.id', shape: 'uuid' }] });
        const [entry] = entriesOf(await store.get());
        expect(entry!.context.user.id === UUID).toBe(preserved);
      });
  });
}
```

### 4.5 Raw write for arranging state (`decisions/retention`, `decisions/failures`)

```ts
it('clears entries older than max_age and keeps the rest [dec-max-age]', async ({ skip }) => {
  const clock = freezeClock();
  const h = await freshHarness(ctx, { max_age: { minutes: 1 } });   // the config under test
  if (!h.raw || !h.capabilities.retainsEntries) return skip('Needs a retaining, observable substrate');
  const store = await h.instance();
  // add() stamps "now", so aged entries can only be arranged underneath it.
  await h.raw.writeAll([
    entry({ ulid: 'old', timestamp: Date.now() - 3_600_000 }),
    entry({ ulid: 'new', timestamp: Date.now() }),
  ]);

  expect(await store.forceClearOldEntries()).toEqual({ ok: true });
  expect(entriesOf(await store.get()).map(e => e.ulid)).toEqual(['new']);
});

it('a junk record on the substrate never makes get reject [dec-logging-never-breaks-control-flow]', async ({ skip }) => {
  const h = await freshHarness(ctx);
  if (!h.raw) return skip('Substrate not observable');
  const store = await h.instance();
  await h.raw.writeAll([{ not: 'a log entry' }, 42, null]);

  const r = await store.get();          // must resolve, never throw
  expect(Array.isArray(r.entries)).toBe(true);
  expect(r.ok === (r.error === undefined)).toBe(true); // dec-failures-as-values: error ⇔ !ok
});

it('an awaited add is readable immediately on the substrate [dec-awaited-write-means-recorded]', async ({ skip }) => {
  const h = await freshHarness(ctx);
  if (!h.raw || !h.capabilities.retainsEntries) return skip('Needs a retaining, observable substrate');
  const store = await h.instance();
  const r = await store.add({ type: 'info', message: 'm' });
  expect(r.ok).toBe(true);
  const ulids = (await h.raw.readAll()).map(x => LogEntrySchema.parse(x).ulid);
  expect(ulids).toEqual([r.entry!.ulid]);            // no waiting, no polling
});
```

A decision about what the store *says* is tested through the interface. A decision about what the store
*holds* is tested through raw access. Keep the two apart.

### 4.6 Implementers' factories

**IndexedDB**: raw access is a second, independent connection to the same database: genuinely underneath
the store.

```ts
// src/log-storage/idb/IDBLogStorage.conformance.test.ts
import 'fake-indexeddb/auto';
runLogStorageConformance(async ({ namespace, options }) => {
  const dbName = `${namespace}_logger`;
  const first = new IDBLogStorage(namespace, options);
  await first.get();                   // let the store create its schema before raw access opens the db
  const raw = idbRawAccess(dbName, 'logs');   // helper: open(dbName, 1) → readonly getAll / readwrite put
  return {
    capabilities: { retainsEntries: true, survivesReopen: true },
    instance: async () => new IDBLogStorage(namespace, options),
    raw,
    dispose: async () => { await raw.close(); indexedDB.deleteDatabase(dbName); },
  };
});
```

Gotchas: raw access must open the database **after** the store's `onupgradeneeded` has run (otherwise it
creates version 1 with no `logs` object store, and the store is then broken). IDB rows carry an extra
auto-increment `id`, so `readAll` should either strip it or tests should narrow with a schema that
tolerates it.

**Memory**: the substrate is a private array (`_log`), so there is nothing to reach without a seam. Choose
one approach:
- Add an **injectable substrate** (e.g. an optional `{ entries: LogEntry[] }` backing array the store reads
  and writes), so the harness holds the same array. Honest raw access, small public cost.
- Or declare `raw: undefined` and accept visible skips on the memory store. The IDB store proves the
  persistence decisions.

Don't cast into the private field; that tests the cast.

**Console / Webhook** (retain nothing):
```ts
// Console: substrate = the injected console; raw.readAll = captured calls; writeAll unsupported.
{ capabilities: { retainsEntries: false, survivesReopen: false }, raw: capturedConsoleAccess(fakeConsole), … }
// Webhook: substrate = a fake HTTP endpoint; raw.readAll = the bodies it received (masking proofs work here too).
```
For substrates that support read but not write, split `RawLogAccess` into optional `read` and `write`
members so each test gates on exactly what it uses.

**Channels**: wire through the stackable entry, with Memory or IDB children. The base battery then runs
through the facade (proving `dec-channels-passthrough-children-are-boundary`), and the stackable-only
battery uses `simulateNextCallFailure` on one child to prove `dec-channels-isolate-channels` and
`dec-partial-results-are-explicit` (the healthy child's rows are returned, `ok: false`, and `onFailure`
fires once).

### 4.7 Calibration for this repo

| Decoy (decorator over MemoryLogStorage / IDBLogStorage) | Must fail |
|---|---|
| Writes the per-call options onto the stored entry | `dec-out-of-band-directive-transport` |
| Skips key-based redaction on write, redacts on read | `dec-key-based-redaction` (raw read) |
| Honours per-call directives regardless of the flag | `dec-allow-per-call-unmasking-gate` |
| `get` rejects on a junk record | `dec-logging-never-breaks-control-flow` |
| Resolves `add` before committing | `dec-awaited-write-means-recorded` |
| Delivers each failure to listeners twice | `dec-failure-signal-in-memory` |

The unmodified stores are the positive control. `FailingLogStorage.ts` and `ForeignLogStorage.ts` in
`testing-helpers/` are already decoy-shaped and can seed this folder.

### 4.8 Migration path from `commonLogStorageTests`

1. Add `conformance/harness-types.ts`, `createHarness`, `freshHarness`.
2. Wrap the existing `CreateTestLogger` factories in harnesses (`recreateWithSameData` becomes
   `instance()`; `cannot_recreate_with_same_data` becomes `survivesReopen: false`).
3. Move the existing `common.ts` tests into `decisions/<cluster>/`, tagging each with its `dec-slug`.
   Keep assertions unchanged, per the "never silently edit a test around a behaviour change" rule.
4. Add raw access to IDB first, then write the raw-read and raw-write batteries above.
5. Fold the cross-store behaviour files (`writes-never-break.test.ts`, `reads-never-break.test.ts`,
   `failure-listeners.test.ts`) into the suite so every store runs them.
6. Add calibration decoys and the type tests.
