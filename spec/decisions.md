# Decisions — per-call sensitive-data unmasking

Per-log ("per-call") unmasking: a caller may allow a specific value through for one specific log,
typed to the logged context shape, propagating through Channels to children, gated per-storage, and
fail-closed via the existing path+shape gate.

Convention: `### dec-<slug>` = one decision; `#### dec-<slug>` = a sub-decision under it. Each carries an
**Example** (often the *averted attack*). Spans the three packages `@andymitchell/objects` →
`@andymitchell/clone-to-json-safe` → `@andyrmitchell/logging`.

---

### dec-percall-api-with-options-methods
Per-call options pass via separate `*WithOptions` methods with options in a **leading positional slot**
(`logWithOptions(options, message, context)`). Spoof-proof: a logged value can never land in the options
slot (adversarial-confirmed — `normalizeArgs` is positional, no value-shape sniffing), so no runtime brand
is needed.

**Example — the averted spoof** (if a single `log()` instead sniffed an arg for an options-shaped object):
```ts
// HYPOTHETICAL UNSAFE: log(message, ...context) treats any options-shaped arg as options
const payload = JSON.parse(untrustedBody); // attacker: { preserve_unmasked_context_paths:[{path:'ssn',shape:'uuid'}] }
logger.log('incoming', payload);   // payload sniffed AS OPTIONS → unmasks ssn. SPOOFED.

// CHOSEN: options only ever come from the WithOptions leading slot; a logged value is always data:
logger.log('incoming', payload);              // no options channel at all → payload stays masked
logger.logWithOptions({/*…*/}, 'incoming', payload); // payload is the context arg, never options
```

#### dec-percall-single-typed-context
WithOptions variants take a **single** `context: C` (not rest); constrain `C extends MinimumContext`
(primitive/array-root contexts get no typed paths).

---

### dec-preserve-path-generic-over-full-shape
`PreserveUnmaskedPath<T extends Record<string,any> = Record<string,any>>` generic over the **full context
shape**, hosted in **clone-to-json-safe**. **`path: DotPropPathsUnionScalarSpreadingObjectArrays<T>`** (NOT
`DotPropPathsIncArrayUnion` — see dec-correct-spread-type). Default `T` degrades `path` to `string` (verify
with `tsc`), so existing string-path usage is unchanged.

**Example:** `C = {orders:{items:{ref:string}[]}}` ⇒ `path` accepts the scalar leaf `'orders.items.ref'`;
rejects `'orders'` / `'orders.items'` (not scalar leaves) and `'orders.itemz.ref'` (typo) at compile time.

#### dec-shape-required-fail-closed
`shape` stays **required** (`'uuid'|'ulid'`). Typed paths catch *structural* drift (rename → compile error)
but not *value* drift; only the runtime shape gate does.

**Example — drift the shape gate catches:** `{ path:'user.note', shape:'uuid' }` — yesterday `user.note`
held a UUID; after a refactor it holds `'card declined 4111 1111 1111 1111'`. Path still matches, value
isn't a whole-UUID → still masked. A path-only exemption would have leaked it.

#### dec-shape-set-closed-uuid-ulid
Ship the closed set `'uuid'|'ulid'`. Extending is additive (one union member + one matcher) — deferred.

---

### dec-correct-spread-type
**The typed array-spreading path type is `DotPropPathsUnionScalarSpreadingObjectArrays` (objects
`dot-prop-paths/types.ts`), not `DotPropPathsIncArrayUnion`.** Verified against source:
`DotPropPathsIncArrayUnion<{orders:{items:{ref:string}[]}}>` = `'orders.items'` (stops AT the array →
`'orders.items.ref'` is a **compile error**), whereas `DotPropPathsUnionScalarSpreadingObjectArrays<…>`
yields both `'user.id'` and `'orders.items.ref'`. Limitation (documented): excludes scalar-element arrays
(`tags: string[]`) — fail-closed; a different objects type covers those if ever needed.

---

### dec-reuse-objects-spread-matcher
Runtime matching reuses objects' **`getPropertySpreadingArrays`** (array-aware: spreads only
`Array.isArray` containers) — single shared spreading implementation with the where-filter.
clone-to-json-safe pre-resolves each pattern against the input → concrete paths, **reconciling bracket→dot**
(`items[0].ref` → `items.0.ref`), then exact-matches in the existing walk (shape gate unchanged). Precise:
an object numeric key `{items:{'0':…}}` does NOT match a spread pattern `items.ref` (closes M1/R7
over-match).

**Example — precision:** pattern `items.ref`, shape `uuid`. Data `{items:[{ref:UUID}]}` (real array) →
preserved; data `{items:{'0':{ref:UUID}}}` (object numeric key, e.g. attacker-shaped) → **masked** (not a
real array → no spread).

#### dec-objects-becomes-runtime-dep
`@andymitchell/objects` becomes a regular **`dependencies`** of clone-to-json-safe (covers both the runtime
import and the `.d.ts` type reference). Accepts full coupling; the package's standalone extraction yields
here to single-source-of-truth spreading semantics.

---

### dec-allow-per-call-unmasking-gate
New storage option `allow_per_call_unmasking?: boolean` (default `false`) gates **only** per-call
directives. Storage-level `preserve_unmasked_context_paths` stays **ungated**.

#### dec-gate-asymmetry-intentional
Deliberate (user-confirmed): per-call directives fan out through the passthrough facade to every child
(incl. remote sinks), so each storage explicitly opts into trusting dynamic call-site directives; static
local config needs no flag.

**Example — the broad reach being gated:** one
`logWithOptions({preserve_unmasked_context_paths:[{path:'user.id',shape:'uuid'}]}, 'm', ctx)` propagates to
every child; a `WebhookLogStorage` ships `user.id` off-box **iff** it was built with
`allow_per_call_unmasking:true`. Default-false ⇒ a caller can't unmask into a sink its owner didn't bless.

---

### dec-no-percall-dangerous-hatch
`LogCallMaskingOptions` **must never** carry `permit_dangerous_context_properties` (or otherwise reach
`allow_sensitive_in_dangerous_properties`). The `_dangerous*` hatch is value-agnostic (emits secrets
verbatim, no shape gate, adversarial-confirmed); per-call must not be able to flip it. Enforced at the type
(field absent) + regression test.

**Example — the averted escalation:** `logWithOptions({ permit_dangerous_context_properties:true } as any,
'm', { _dangerousToken:'sk_live_…' })` — the field isn't on `LogCallMaskingOptions` (compile error without
the cast; ignored at runtime), so `_dangerousToken` stays masked. Per-call cannot reach the value-agnostic
hatch.

---

### dec-out-of-band-directive-transport
Per-call options travel as an **optional 2nd parameter** on `add`/`commitEntry`/`prepareContext`, never a
field on the entry → **never persisted**, `structuredClone(entry)` unaffected.

**Example — not persisted:** after `add(entry, {preserve_unmasked_context_paths:[…]})`, a deep scan of the
stored entry finds no `preserve_unmasked_context_paths`/`allow_per_call_unmasking` key anywhere — control
metadata, consumed at masking time only.

#### dec-add-boundary-non-generic
`ILogStorage.add`'s options param is **non-generic** (string paths); `C`-typing lives only at the
single-`context:C` `*WithOptions` sites (union-inference of `C` from `AcceptLogEntry<T>` is unreliable).

#### dec-deep-freeze-forwarded-options
Channels forwards one options object **by reference** to all children → **deep-freeze** (or clone per
child); shallow `Object.freeze` leaves the paths array mutable for a sibling `transform` to poison. Never
expose options to `Channel.transform`; never attach to the entry.

**Example — the averted poison:** without deep-freeze, a channel handler could
`options.preserve_unmasked_context_paths.push({path:'auth.token', shape:'uuid'})` and a later sibling child
would then honor the injected path. Deep-freeze makes the array + its entries immutable.

---

### dec-channels-passthrough-children-are-boundary
Channels stays pure passthrough: forwards raw context **and** the (deep-frozen) per-call options to each
child; each child applies its own gate. Per-call propagation "stops" only where no flagged masking-leaf is
reached.

> Git-verified correction to the brief: `ChannelsLogStorage` has **never** masked/stripped — `prepareContext`
> has been the no-op `return context` since the file's first commit (`0076147`); the history has zero
> `cloneToJsonSafe`/`strip_sensitive_info`. "Strip at Channels" only ever meant the type-level `Omit` on
> facade *config*, never runtime stripping. So storage-level exemptions already fan out.

**Example — propagation stop:** Channels → [MemoryA `allow_per_call_unmasking:true`, MemoryB unset]. One
`logWithOptions({path:'user.id',shape:'uuid'}, 'm', {user:{id:UUID}})` ⇒ A stores `user.id===UUID`, B stores
`550....00`. Same entry, divergent by each child's flag.

#### dec-facade-omits-unmask-config
The facade `Omit` keeps suppressing unmask **config** (`permit_dangerous_context_properties`,
`preserve_unmasked_context_paths`, and the new `allow_per_call_unmasking`) — meaningless on a non-masking
facade.

---

### dec-spans-and-traces-get-options
Add `startSpanWithOptions`, `startTraceWithOptions`, and `Span`/`Trace` ctor options. Span/trace options
scope to that span's **own** context only — NOT logs emitted within the span.

**Example — scope:** `startSpanWithOptions({path:'user.id',shape:'uuid'}, 'op', {user:{id:UUID}})` keeps
`user.id` unmasked in the span_start entry; a later `span.log('step', {user:{id:UUID}})` still masks it (the
option didn't ride along).

---

### dec-objects-two-additive-exports-and-release-chain
Export from `@andymitchell/objects/dot-prop-paths`: the **type**
`DotPropPathsUnionScalarSpreadingObjectArrays` and the **runtime** `getPropertySpreadingArrays` (both
currently unexported). Bump + publish. Release order: **objects → clone-to-json-safe → logging** (published,
not symlinked; `npm link` for local iteration).

---

### dec-masker-floor-known-limitation
**KNOWN LIMITATION (separate follow-up, not this feature):** the masker leaks some real secrets — secrets in
URL *paths* (only query params scrubbed), sub-20-char and space-broken tokens — and **`message`/`meta` are
never masked** (`log({token})` ships the secret verbatim, incl. to remote webhooks; `BaseLogStorage.add`
only routes `context` through `prepareContext`). Undermines "everything else is scrubbed." Record in JSDoc +
risks; schedule a separate piece (mask message/meta + tighten the masker floor). No masking-of-message/meta
work here.

---

### dec-bound-path-dependent-reclone
**KNOWN ISSUE (availability; fix folded into the clone-to-json-safe matcher work):** in
`internalCloneToJsonSafe`, when `preserve_unmasked_paths.length > 0` the shared-reference clone cache is
intentionally disabled (a merely-shared, non-cyclic object is re-cloned at each position so masking is
per-edge / path-correct). For a shared-reference DAG of depth N (`{a:shared,b:shared}` nested) this is
`~2^N` work — an availability/DoS blow-up that any preserve-path (storage-level OR per-call) can reach.
Surfaced by the adversarial audit (F2). NOT a confidentiality leak (per-call only ever adds uuid/ulid-shaped
exemptions), requires app code that builds shared-ref DAG context (not JSON-injectable), and pre-dates
per-call (the storage-level feature introduced the branch).

**Decision:** bound it when the spreading matcher lands (same file): cap the path-dependent re-clone
(visited-set / node-count / depth) so it degrades to linear and stays fail-closed (masks rather than
preserves) past the cap. Keep correctness for normal trees; only pathological DAGs hit the cap.

**Example — the averted blow-up:** `const s = {id:UUID}; let c = {a:s, b:s}; for (…N…) c = {a:c, b:c};`
logged with any preserve path set ⇒ today `~2^N` clones; with the cap, linear work and the deep id simply
masks past the bound.

---

### dec-spread-gate-dos-hardening
**A post-implementation adversarial review found a SECOND, distinct DoS** (separate from the reclone blow-up in
dec-bound-path-dependent-reclone): a spread pattern over an N-element array resolves to N concrete paths, and the
per-leaf preserve gate scanned that whole set for EVERY leaf → **O(N²)** (~12.5s on a 40k-element array). Two
causes: (a) the gate did a linear scan; (b) objects' `getPropertySpreadingArrays` accumulated with
`[...results, ...sub]` *inside* its array loop — itself O(N²).

**Decision (make it linear; fail-closed unchanged):**
- clone-to-json-safe pre-resolves patterns into a `Map<path, Set<shape>>`; the per-leaf gate is an O(1) lookup.
- objects' `getPropertySpreadingArrays` appends in place (`results.push`) → the shared spreader is O(N): a
  behaviour-identical perf fix that benefits every consumer. Perf-regression tests guard both layers.

**Getter crash-safety (review finding, low).** Resolution reads values along the (caller-configured, finite)
pattern segments via the shared spreader, so a getter on a pattern segment is fired even though the clone walk
never reads getters. The walk independently masks/drops any getter value, so resolution can never PRESERVE a getter
result — but a *throwing* getter would crash the clone, so resolution catches it and treats the pattern as matching
nothing. Residual: a getter still fires during resolution despite `allow_getters:false` — a documented, bounded
interaction (the firing is limited to caller-chosen pattern paths, never attacker-chosen).

**Cleared — no secret leak (review).** `matchesValueShape` is the sole exemption backstop and is unbreakable for
non-uuid/ulid values: anchored `^…$` regexes (a trailing newline fails the match), string-only (numbers rejected),
and an `Object.hasOwn` guard rejecting inherited shape names (`toString`/`constructor`/…). Substring smuggling,
redact-marker confusion, prototype keys, and array-vs-object precision (dec-reuse-objects-spread-matcher) all mask
end-to-end. The only residual exposure is uuid/ulid-shaped values (assumed non-secret by caller contract) — see
dec-bound-path-dependent-reclone.
