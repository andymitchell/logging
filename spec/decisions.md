# Decisions — per-call sensitive-data unmasking

Per-log ("per-call") unmasking: a caller may allow a specific value through for one specific log,
typed to the logged context shape, propagating through Channels to children, gated per-storage, and
fail-closed via the existing path+shape gate.

Convention: `### dec-<slug>` = one decision; `#### dec-<slug>` = a sub-decision under it. Each carries an
**Example** (often the *averted attack*). Spans the three packages `@andymitchell/objects` →
`@andymitchell/clone-to-json-safe` → `@andymitchell/logging`.

Every decision that constrains an `ILogStorage` implementation is proven by the conformance suite in
`src/conformance`, whose tests carry the slug they prove (`[dec-slug]`). A decision without a tagged test is not
yet a rule. Coverage today: the stored-entries and conformance-suite decisions; the rest is future work.

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

**Refined in 0.4.0 (key-based redaction, dec-key-based-redaction).** Resolution now SKIPS any preserve path whose
segment the walk would key-redact — using the FULL activation predicate, not a bare name match — so a getter
beneath a *sensitive* key is never fired even here (the walk would redact that subtree unread, so the leaf is
unreachable; skipping is output-preserving). A `_dangerous`-hatched segment is NOT skipped (the walk does not
redact it), so its path still resolves and preserves. This narrows the residual to getters on NON-sensitive
caller-chosen preserve paths.

**Cleared — no secret leak (review).** `matchesValueShape` is the sole exemption backstop and is unbreakable for
non-uuid/ulid values: anchored `^…$` regexes (a trailing newline fails the match), string-only (numbers rejected),
and an `Object.hasOwn` guard rejecting inherited shape names (`toString`/`constructor`/…). Substring smuggling,
redact-marker confusion, prototype keys, and array-vs-object precision (dec-reuse-objects-spread-matcher) all mask
end-to-end. The only residual exposure is uuid/ulid-shaped values (assumed non-secret by caller contract) — see
dec-bound-path-dependent-reclone.

---

## Sophisticated, named masking detectors (clone-to-json-safe)

The masker's four anonymous `.replace()` passes (URL → email → digit-run → 20+‑char token) became an ordered
**registry of named detectors** in `clone-to-json-safe/src/sensitiveDetectors.ts`, adding password, IPv4, SSN,
PEM private-key and known key/JWT shapes, and splitting the digit run into card/phone. Category names are
**internal only** — every pre-existing masked OUTPUT is byte-identical (the whole existing suite passes
unchanged) — and exist to enable a FUTURE enable/disable-by-name toggle (NOT built). No masking code changed in
`logging`; it delegates via `cloneToJsonSafeUnknown`.

### dec-detector-registry-named
Masking is an ordered `SENSITIVE_DETECTORS: readonly SensitiveDetector[]` (each `{ characteristic, pattern,
mask }`), iterated as one `String.replace` per detector, specific → generic (`url`, `private-key`, `email`,
`jwt`, `api-key`, `ip`, `ssn`, `card`, `phone`, `password`, `token`). Mirrors the repo's `nonSerialisableRegistry`
/ `valueShapes` named-set style. A `mask` returns its match **unchanged** to decline. `SensitiveCharacteristic`
is the public single-source union (re-exported from `index.ts`); the toggle is future work (would just filter the
array — deliberately not added).

**Example — the registry integrity invariant (regression-tested):** every detector's `characteristic` is unique
and the set equals the declared union, so a duplicate or an orphaned union member fails the test.

### dec-password-shape-high-precision-only
The `password` shape detector is deliberately **high-precision** (fire only when QUITE CERTAIN), not
recall-maximising. An adversarial review + a second-opinion security review converged on this: a value-shape
masker fundamentally cannot separate a weak password (`Password1`, `Summer2024`) from a benign token of the
identical shape (`Angular2`, `Windows10`, `order12345`, English prose), so chasing weak passwords by shape
shreds log readability for little gain (mirrors how gitleaks needs a 1,479-word stopword list + entropy floor
to keep a generic-password rule usable, and how pino/Datadog redact by key, not shape). The candidate is a run
of 8–19 chars (20+ is the token pass's job, masks identically), split off surrounding syntax by an excluded
delimiter class (`= : " ' \` , ; ( ) [ ] { } < >`; see dec-password-extract-from-syntax), classified on the
run minus one wrapping quote pair. It fires on:

- **Symbol** — a high-signal symbol `[!#$%^&*]` among a letter+digit (`P@ssw0rd!`). Separators `. - _ / : @`
  are NOT "special", so dates/paths/emails don't trip it.
- **Spread leetspeak** — pure-alnum with digits SPREAD through the run (**≥3 letter↔digit transitions**) plus a
  letter "syllable" (**letter run ≥2**): `p4ssw0rd`. Spread excludes clustered-number tech terms (`base64url`,
  `win32api`, 2 transitions); the syllable excludes single-char hex ids (`1a2b3c4d`).

**Deliberately NOT masked by shape** (left readable): Word+Digits (`Summer2024`, `order12345`, `Windows10`),
single-digit (`Password1`, `Python3`), zero-digit words (`iloveyou`), hex ids (`1a2b3c4d`). No "already-masked"
`...` guard (an earlier bypass — `Ab1...Cd2!` is a real secret — and redundant).

**Why this is safe, not a leak (key-based is the primary control):** secrets that carry a telltale KEY
(`{ password: … }`) are to be redacted **strength-agnostically by key-based redaction** (dec-key-based-redaction,
spec'd separately), which satisfies the compliance obligation to redact ALL credentials regardless of strength.
This shape net only covers the residual of an **un-keyed** secret sitting in a free-text `message` string — and
there it intentionally accepts a leaked *weak/wordy* secret rather than mask `Angular2`/prose. (The "weak = low
value" framing is explicitly NOT the justification — password reuse makes weak secrets dangerous; the
justification is that shape can't catch them without destroying logs, and key-based carries the redact-all duty.)

#### dec-password-extract-from-syntax
The password candidate class **excludes the delimiters that wrap values in logs** (`= : " ' \` , ; ( ) [ ] { }
< >`), so a secret embedded in syntax is split off from that syntax before classification — otherwise the
delimiter made the whole run non-alphanumeric and it slipped past both the password and token rules (a review
finding). A candidate of ≥20 chars is declined and left to the token pass (which masks it identically), keeping
long-token output byte-identical and never corrupting a long token that merely contains an excluded delimiter
(e.g. base64 `…cGQ=`). The mask ALSO trims wrapping *boundary* punctuation — a leading/trailing char that is
neither alphanumeric nor a high-signal `[!#$%^&*]` symbol — off the candidate before classifying, so a secret
abutting sentence punctuation (`p4ssw0rd.`, `p4ssw0rd?`) is judged on its core and re-wrapped on a hit; an
INTERNAL separator is left in place (still breaking the pure-alnum rule), so `snake_case_1x` stays readable. (A
review finding: the candidate class does not exclude `.`, so a trailing `.` made `p4ssw0rd.` non-alphanumeric and
it leaked.)

**Example — averted leak:** `password=p4ssw0rd` → `password=p4s...0rd`; `password: p4ssw0rd.` → `password: p4s...0rd.`;
a non-final JSON value `"p4ssw0rd",` masks.

---

### dec-frozen-segment-engine
The replacer holds the value as an array of segments, each `{ text, frozen }` (starting as one non-frozen
segment). A detector that finalises a span (URL, IP, private-key marker) reserves it via `ctx.reservePlaceholder`;
after that detector's pass the reserved placeholder is split out into its own **frozen** segment. Later detectors
run only over non-frozen segments, so a finalised span is (a) never re-scanned and (b) — being a distinct segment
— can never be spanned by a later pattern reaching across it into adjacent text.

This replaces the earlier "reserve → restore the placeholder at the very end" scheme, which left a short
placeholder (`__URL_PH@0__`, <20 chars) sitting in the live string. When it abutted non-whitespace the COMBINED
run crossed 20 chars and the generic 20+ token pass ate it, mangling the placeholder so restoration silently
DROPPED the finalised value (a review finding, two symptoms: a glued IP and a glued private-key marker).

**Why segmentation over "decline any match containing the placeholder prefix":** the decline approach drops the
WHOLE glued run, so a real secret concatenated with no delimiter to a finalised span would leak. Segmentation has
no such false-negative — the frozen span is isolated and any adjacent secret is still scanned on its own.

**Examples — averted loss:** `clientIp=8.8.8.8` → `clientIp=8.x.x.x` (was `cli...0__`, IP lost);
`a=8.8.8.8,b=1.1.1.1` → `a=8.x.x.x,b=1.x.x.x`; `privateKey=<PEM>` → `privateKey=[private-key]` (was `pri...ey]`).

### dec-placeholder-absent-from-input
The placeholder that stands in for a finalised span (see dec-frozen-segment-engine) uses a prefix verified
**absent from the input** — a per-invocation base-36 nonce is appended only on a real collision. So the pass that
splits reserved spans into frozen segments can never mistake user-controlled text that mimics the marker syntax
for a real placeholder, and the frozen value is emitted verbatim (a `$` inside it is never treated as a
replacement pattern). Output stays deterministic — the nonce surfaces only when the literal prefix is already in
the input, and even then only inside a frozen segment that is never emitted.

**Example — averted corruption:** `__URL_PH@0__ 8.8.8.8` → `__URL_PH@0__ 8.x.x.x` (the user's literal marker
survives as ordinary text; only the real IP is masked, in place).

### dec-card-phone-luhn-relabel-no-output-change
`card` claims the shared 7+‑digit run ONLY when the cleaned digits are 13–19 long AND Luhn-valid (`src/luhn.ts`);
otherwise it declines and `phone` (the original digit rule, verbatim) masks the identical run. Both call the same
`hideDigits`, so **output never changes — only the internal label.** A wrong Luhn verdict can never leak a card;
it only mislabels.

**Example:** `4242 4242 4242 4242` (Luhn-valid) → labelled `card`; `1234-5678-9012-3456` (Luhn-invalid) →
labelled `phone`; both mask to `…...…`. The existing card test number is Luhn-invalid, hence relabelled yet its
`12...56` output is unchanged.

### dec-known-key-wordboundary-excl-pk-parity
`jwt`/`api-key` (Stripe/OpenAI/AWS/GitHub/Google/Slack) are **word-boundary** anchored with realistic length
floors, and mask with `hideToken` — so a key embedded after `=`/`"` is caught (whole-run anchoring missed it),
a bare ≥20 key stays byte-identical (`sk_...Key`, `eyJ...w5c`), and a benign `sk_foo_bar` is left alone. Real
keys are mostly ≥20 (already token-masked), so this is chiefly **classification** plus minor short-key coverage.

- **`pk_` (Stripe publishable) EXCLUDED** — non-secret, and the only quote-wrapped existing test. Left to the
  generic token pass, `"pk_test_…123456"` still yields `pk...56`; a precise `pk_` rule would have shifted it to
  `pk_...456` (a regression).

**Example — averted regression:** `apiKey=sk_live_0123456789abcdefghij` → `apiKey=sk_...hij` (word boundary,
prefix kept) instead of whole-run `api...hij`; `config sk_foo_bar here` unchanged (length/format floor).

### dec-ip-carveout-via-placeholder
`ip` runs before the digit detectors and pushes its result through `ctx.reservePlaceholder(...)`, so a value it
finalised can't be re-touched by a later pass. Loopback/RFC1918-private/link-local (v4) and loopback/link-local/
unique-local (v6) addresses are kept **readable**; public addresses are reduced to a leading octet/hextet hint
(`8.8.8.8`→`8.x.x.x`, `2606:4700::1`→`2606:x`). The placeholder is load-bearing: a private `192.168.1.1` has 8
digits, so without it the phone pass would re-mask the carve-out to `19...11`.

**Example — behaviour delta (no existing test covered IPs):** public `8.8.8.8` (was visible) → `8.x.x.x`; private
`192.168.1.1` (was `19...11`) → readable. A finalised IP is frozen (dec-frozen-segment-engine), so it survives
even glued to a field name: `clientIp=8.8.8.8` → `clientIp=8.x.x.x`.

#### dec-ipv6-bounded-anchored-regex
IPv6 IS detected (a code review showed a plain public `2606:4700::1` was leaking — IPv4-only + the 20-char token
rule both declined it). Two properties make it safe in free-text logs:
- **Anchoring, not just validation.** A leading lookbehind `(?<![\w:.])` refuses a candidate that abuts an
  identifier char (letter/digit/`_`), `:` or `.`, so scope-resolution code (`std::vector`, `Foo::Bar`,
  `App::Models::User`, `ip_fe80::1`) is never matched. A trailing lookahead `(?![\w:]|\.\d)` refuses a trailing
  identifier char/colon — so `2606:4700::1g` declines instead of emitting a corrupt `2606:xg` — and a
  dotted-numeric suffix, so IPv4-mapped `::ffff:1.2.3.4` declines and its embedded IPv4 is caught instead; it
  DOES allow a bare sentence dot, so `2606:4700::1.` masks to `2606:x.`. (Both trailing bugs — a swallowed letter
  and a rejected sentence dot — were a review finding.) The span is then fully re-validated by `maskIpv6IfValid`,
  so times (`12:34:56`) and 6-group MACs fail structurally.
- **Fully length-bounded grammar (ReDoS-safe).** Every quantifier is `{1,n}` (an address has ≤8 groups). The
  first draft used an unbounded `(…)*` before `::` and backtracked **quadratically** (~2.6s on a 60KB `a:a:a…`
  string); the bounded canonical form is linear (<1ms on 120KB). A perf regression test guards this.

**Residual (accepted, documented):** an all-hex identifier such as `dead::beef`, or an 8-group EUI-64 MAC, is
indistinguishable from an address and may be masked. Rare, and over-masking is fail-safe.

**Example — averted FP vs caught leak:** `at std::vector line` unchanged; `2606:4700::1g` unchanged (no corrupt
`2606:xg`); `edge 2606:4700::1 seen` → `edge 2606:x seen`; `2606:4700::1.` → `2606:x.`.

#### dec-ipv4-reject-adjacent-dotted
The IPv4 pattern is fenced by `(?<![\w.])…(?![\w]|\.\d)` so it only matches a dotted-quad standing on its own: the
lookbehind rejects a leading identifier char (letter/digit/`_`) or dot, and the lookahead rejects a trailing
identifier char or a dotted-numeric suffix, while still allowing real delimiters (`=`, `(`, space) and a bare
sentence dot. The first cut fenced only digits/dots (`(?<![\d.])…(?!\.?\d)`), which let an address glued to
LETTERS through — `foo8.8.8.8bar` → `foo8.x.x.xbar`, `release v1.2.3.4` → `v1.x.x.x` (a review finding).

**Examples:** `foo8.8.8.8bar` / `release v1.2.3.4` / `ip_8.8.8.8` unchanged; `addr=8.8.8.8` → `addr=8.x.x.x`,
`(8.8.8.8)` → `(8.x.x.x)`, `8.8.8.8.` → `8.x.x.x.`; `build 1.2.3.4.5 tag` unchanged (the ≥7-digit dotted run is
left to the digit rule, fully masked — never a partial IP).

### dec-privatekey-short-marker
A PEM block (`-----BEGIN … PRIVATE KEY----- … -----END … PRIVATE KEY-----`, lazy, matches real or JSON-escaped
newlines) is redacted **whole** to the short marker `[private-key]` — partial-masking a key is pointless. The
marker is emitted via `ctx.reservePlaceholder`, so it is **frozen** (dec-frozen-segment-engine) and survives even
when the block is glued to a field name: `privateKey=<PEM>` → `privateKey=[private-key]`. Returning the marker as
plain text used to let the 24-char `privateKey=[private-key]` run be eaten by the 20+ token pass → `pri...ey]` (a
review finding). On a bare `[private-key]` input the block pattern does not match, so the marker is not re-frozen
and re-masking stays a **no-op**.

**Example — idempotent:** `simplePrivateDataReplacer('[private-key]') === '[private-key]'`.

### dec-ssn-dashed-only
`ssn` matches the dashed `\b\d{3}-\d{2}-\d{4}\b` form only (bare 9-digit runs stay `phone`) — conservative, and
it masks with `hideDigits`, so `123-45-6789` → `12...89` exactly as the old digit pass did; this only relabels.

**Deferred (documented, not built):** the enable/disable-by-name toggle; deep-scanning IPs/secrets inside a URL
host/path (the URL detector still shields its whole span); and further ideated detectors (MAC, IBAN, cloud
secret envs, wallet addresses, base64 blobs). **Known pre-existing (out of this review's scope):** the `email`
regex `[A-Za-z0-9._%+-]+@` backtracks quadratically on a long dotted/alphanumeric run with no `@` (~2.6s on
~60KB) — unchanged by this work; flag for a separate ReDoS hardening pass.

---

## Key-based redaction (clone-to-json-safe 0.4.0, consumed by logging)

Companion spec: `key-based-redaction.md`. Masks a value because its FIELD NAME is sensitive
(`password`/`apiKey`/`ssn`/…), shape- and strength-agnostic — the compliance-grade primary control the
high-precision shape net (dec-password-shape-high-precision-only) deliberately leaves to it.

### dec-key-based-redaction
When the clone walk meets a property whose KEY is sensitive it assigns the marker `redact:sensitive-key`
**without reading the value** and does not recurse — a scalar and a whole subtree alike collapse to the one
marker, so a getter under the key never runs and no field-name structure leaks. Gated hard by
`strip_sensitive_info` (masking off ⇒ keys never inspected); **on by default** when stripping is on
(`redact_sensitive_keys` defaults `true`), and an explicit `undefined` never disables it — `resolveOptions`
guards every option whose default is non-`undefined`, so a programmatic `{ redact_sensitive_keys: cfg.x }` with
an undefined `cfg.x` falls back to the default rather than failing open.

**Matching is whole-token, contiguous-sublist** (tokenizing per dec-key-tokenizer-linear): a name matches iff its
tokens are a contiguous run in the key's tokens, or a solid-lowercase key equals the name joined. This needs no
Tier-1/Tier-2 word tiering (the originally-proposed scheme): multi-word names are inherently compound-safe
(`apiKey`→`api_key`/`x-api-key` ✓, bare `key` ✗) and single-word names match as whole tokens
(`password`→`dbPassword` ✓, `passwordless` ✗). The built-in list is a conservative core; supplying
`sensitive_key_names` REPLACES it (spread `BUILT_IN_SENSITIVE_KEYS` to extend). Two supplied-name classes are
dropped as unusable: empty/all-punctuation, and **purely numeric** — a bare number can only match a structural
array index, never a secret FIELD (the same principle that treats an array's `length` slot as structural and
bypasses redaction/masking for it, avoiding a `RangeError` from assigning a marker to `arr.length`).

**Precedence:** the `_dangerous` hatch (`allow_sensitive_in_dangerous_properties`, default off) preserves a
`_dangerous*` key; otherwise key-redaction **wins over the `preserve_unmasked_paths` allow-list** — structurally
the key check precedes leaf resolution, so a secret KEY overrides value-shape preservation. This INVERTS the
pipeline order in the original proposal; safe because the allow-list only preserves opaque `uuid`/`ulid`/`sha256`
shapes a real secret ~never wears. logging surfaces it as `redact_sensitive_context_keys` /
`sensitive_context_key_names` (masking config, so `ChannelsLogStorage` omits both), on by default for every sink;
`BUILT_IN_SENSITIVE_KEYS` is re-exported from logging so consumers extend without a deep import.

**Example — averted leak:** `log(ctx, { password: 'Password1' })` — a Word+Digits value the shape net leaves
readable under a benign key — redacts to `{ password: 'redact:sensitive-key' }` because the KEY is sensitive;
`{ credentials: { user, apiKey } }` collapses to one marker with no nested field-name leak; an allow-listed uuid
at `{ apiKey }` is still redacted (key wins); a getter on `{ password: get x(){…} }` never fires.

### dec-key-tokenizer-linear
`tokenizeKey` is a single **O(n) character scanner**, not a regex. The obvious acronym rule
`/([A-Z]+)([A-Z][a-z])/g` backtracks **quadratically** on a long all-caps key (≈6s on a 64k-char key) — a DoS on
untrusted, attacker-controllable JSON keys. The scanner applies the same two boundary rules (open a token on
lower/digit→Upper, and at an acronym tail Upper→Upper-before-lower) in one pass, and was proven token-for-token
identical to the old regex across ~550k inputs (17 traced + 500k random + a near-exhaustive length-≤9 char-class
proof of 349,525 strings). A perf regression test guards linearity, mirroring dec-ipv6-bounded-anchored-regex.
Deleting the regex also removed a stray NUL sentinel byte that had made the source a git-binary file.

**Example — averted DoS:** a 100k-char all-caps key tokenizes in <1ms (was seconds under the regex); output
identical.

---

## Packaging on GitHub Packages

### dec-no-optional-peers-on-github-packages
**Never declare an optional peer in a package published to GitHub Packages.** The registry drops
`peerDependenciesMeta` from the abbreviated packument that `npm install` reads (GitHub community discussions
#41534, #51104; pnpm/pnpm#9814 — no fix planned). npm 7+ installs every peer it sees, so every declared peer is
effectively **required**, and every consumer gets it whatever entry point they import. A subpath export is
therefore not a dependency boundary npm respects; only a separate package is. Code with heavy, optional runtime
needs (React UI) ships as its own package that declares them as ordinary required peers.

Workarounds rejected: `--legacy-peer-deps` / `--omit=peer` push the fix onto every consumer and also drop the
genuinely required `zod`; a devDependency-only react gives UI users no version contract; `optionalDependencies`
are still installed; leaving GitHub Packages breaks the family's single registry.

**Example — observed leak:** 0.12.0 declared `react` and `react-json-view-lite` as optional peers for its `/react`
entry. A backend-only consumer's lockfile (authension) recorded logging's `peerDependencies` with **no**
`peerDependenciesMeta` and installed `node_modules/react-json-view-lite` flagged `"peer": true`, although the
consumer never imports the UI. 0.13.0 removes `/react`; `zod` is the only peer.

#### dec-ui-consumes-logging-as-peer
`@andymitchell/logging-ui-react` declares this package as a **peer** (`>=0.13.0 <1.0.0`), never a dependency: the
UI accepts a `TraceViewer` instance or a plain function as its source and branches on `instanceof TraceViewer`, so
a second nested copy of logging makes the check fail and the instance is then called as a function. The loose
range stops every logging minor from forcing a UI republish (a strict caret would push consumers to `--force`,
nesting that second copy). In return, the symbols the UI imports are a contract: `isLogEntrySimple`,
`isEventLogEntry`, `isEventLogEntrySpanStart` (root entry, via `index-guards.ts`) and `isTraceResult`,
`TraceResult` (`/get-traces`), alongside the long-public `TraceViewer`, `TraceFilter`, `TraceSearchResults`,
`LogEntry`, `SpanMeta`, `TraceEntry`, `MinimumContext`. Renaming or removing one is a breaking change for the UI.
- Changing the **signature** of a contract symbol breaks the UI just as a rename does, and the loose range
  lets every published UI accept the new logging without complaint. Such a change ships only together with a
  UI release that handles it, and the README says which UI version the logging release needs.

**Example:** `TraceViewer.getTraces` resolving `{ ok, traces, error? }` instead of an array. A UI that calls
`traces.map(...)` on the result fails at runtime, yet npm installs it without a warning. Logging 0.15.0 is
therefore released together with a UI release that reads `.traces`.

---

## Logging never breaks control flow

Logging is a side effect of the app's real work. A failing store (IndexedDB full, a webhook down, a value
that cannot be cloned) must never change what the app does. Failures come back as **values**; one in-memory
hook on the store lets the app forward them to a channel that is not this logger. Changing every public
write and read from a bare payload to a result is a breaking change.

### dec-logging-never-breaks-control-flow
**Every public operation on stores, loggers, spans and the trace viewer resolves. None throws or rejects,
and nothing is left unhandled, whatever the store does and whatever value is logged.** This covers
construction too: starting a span or trace on a failing store returns a usable span.

Deliberate exceptions are programmer errors at wiring time, deterministic and caught on the first run:
- constructors validating their configuration (`ChannelsLogStorage` with no channels, `ConsoleLogStorage`
  without a console, `Logger`/`Trace`/`Span` given a store lacking `onFailure` or `reportInternalFailure` —
  a store written against an older `ILogStorage`);
- `continueTrace` given a non-object (callers validate untrusted input with `SpanIdSchema` first);
- breakpoint management (`addBreakpoint`/`removeBreakpoint`/`listBreakpoints`), a human dev-tool API that
  keeps its shape.

**Example — averted outage:** IndexedDB is full. Inside Authension's `authorize`, `span.warn(...)` runs after
the tokens were saved. If the write rejected, sign-in would report failure for a sign-in that succeeded.
Instead `span.warn` resolves `{ ok: false, error }` and sign-in is unaffected.

### dec-failures-as-values
**Writes resolve `LogWriteResult`, reads `LogReadResult`, admin calls (`reset`, `forceClearOldEntries`)
`LoggingResult`, and the trace viewer `GetTracesResult`.**
- `ok` is `true` only if every source the call consulted succeeded. `error` is present exactly when `ok` is
  `false`.
- The payload always carries whatever was obtained: `entries` and `traces` are always arrays (empty on a
  total failure); a failed write carries `entry` whenever the entry was built.
- `result.error?.message` and `result.entry?.ulid` work without narrowing; narrowing on `ok` or on
  `result.error` both work.
- The result is the **only** path a failure takes to the caller. Nothing is reported outside a public call:
  no delivery from constructors, timers or background cleanup.
- `LoggingError` is JSON, enforced by the type system (`details?: JsonValueCapped`), so it can be handed to
  any reporter as-is.
- A write's `ok` covers every step the store runs for it, not only the commit: a failed breakpoint check or
  `log_to_console` echo fails the result although the entry was recorded. The breakpoint check is awaited
  so its failure can reach the result.

**Example:** `const r = await span.warn('x'); if (r.error) reportLoggingBroken(r.error);` — no `try`, and a
caller that ignores the result loses nothing but the log.

#### dec-failed-result-factory-exported
**Store authors build a failure with the exported `createLoggingFailedResult(...failures)`**, never by hand.
Every failed result then has the same shape and the same one-line `message` summary, whichever store (built-in
or custom) produced it. The two halves of a result are the exported types `LoggingOkResult` and
`LoggingFailedResult` (`LoggingOk` / `LoggingFailed` remain as deprecated aliases).

**Example:** a custom store's write hook that cannot reach its backend returns
`createLoggingFailedResult({ source: 'MyStore:my-app', operation: 'write', message: 'Could not record the entry.' })`;
the caller sees `error.message === '[MyStore:my-app] Could not record the entry.'`, exactly as it would from
IndexedDB. A hand-built `{ ok: false, error: { message: 'oops', failures: [...] } }` would give reporters a
summary in a different format from every other store's.

#### dec-partial-results-are-explicit
When a call consults several sources (a Channels facade, or a trace viewer over one), some can succeed while
others fail. The result says so, and never presents a partial answer as complete.
- `ok` means **complete**, not "answered". A top-level success flag that means "answered", with failures
  tucked into a side field, makes incomplete data look complete; every consumer that cares ends up wanting
  strict. So any failed source gives `ok: false`.
- Data and errors sit side by side: the payload holds what was obtained and `error.failures[].source` names
  every source that failed. A UI renders what it has and flags what broke:
  `setRows(r.entries); setBroken(r.error?.failures.map(f => f.source) ?? [])`.
- One failure event per call: `onFailure` receives the combined error once, never once per child plus once
  for the total. A trace search reads the store once and builds every trace from that read, so a failing
  store's listeners hear one failure per search, and a trace is never shown without the entries that were read
  for it.
- Tests are strict by default: the test helper `entriesOf` fails on any `error`, so a dead child cannot hide
  behind a healthy one.
- Accepted cost: `if (!r.ok) return` drops the partial rows. That fails loudly and the developer fixes the UI;
  the alternative fails silently.

**Example — averted blind spot:** a facade over IndexedDB (dead) and Memory (healthy). A viewer that went
blank would hide Memory's logs exactly when they are needed to debug IndexedDB; an "ok means answered" result
would hide the outage and let a "survives reload" test pass. Instead the viewer shows Memory's rows, flags
`IDBLogStorage:my-app`, the test fails, and `onFailure` fires once.

### dec-classify-failure-once-at-origin
**A `LoggingFailure` is written by the store where the failure happens and passed up unchanged.** It holds a
`source` (store name and namespace, e.g. `IDBLogStorage:my-app`), an `operation`, a plain-English `message`
and optional JSON `details`. The store converts its own problem into something clean before passing it out
(IndexedDB: the `DOMException` name; Webhook: the HTTP status). A Channels facade lists its children's
failures as they are, adding only its own.
- Failure records are **developer content**: the store's masking options are not applied to them. The only
  user-provided value in a record is the namespace inside `source`, which is cloned with
  `strip_sensitive_info` first.
- The store name in `source` is written out by each store (`storeName`), not read from the class: a
  minifier shortens class names in exactly the production builds whose failures get forwarded.
- A store that throws or rejects from a hook instead of answering is described by its `toFailure`: by
  default the store and operation with a generic sentence, never the thrown value. The thrown value can be
  anything, including one that throws when inspected (a revoked Proxy fails even `instanceof`), so the base
  catches an override that throws and answers with the default failure: a broken description costs only its
  `details`, never the call.
- IndexedDB's hooks reject with whatever IndexedDB raised, and its `toFailure` adds `details: { name }` only
  for a `DOMException` whose name is one IndexedDB defines (`ConstraintError`, `QuotaExceededError`, …).
  Being a `DOMException` is not enough: app code can construct one with any name, e.g. a getter in `meta`
  throwing `new DOMException('x', 'alice@example.com')`. Any other thrown value (an app's error, a filter's own
  error) gets no `details`: its name is whatever its author chose.
- `Span`, `Logger` and the trace viewer create a failure only in their final safety net — a store that
  throws, rejects or resolves something that is not a result, or a bug in their own code:
  `operation: 'unexpected'`, `source: 'Span' | 'Logger' | 'TraceViewer'`. A store's misbehaviour is handed
  to the store with `reportInternalFailure` and returned; both are the same object. If
  `reportInternalFailure` itself throws, the throw is swallowed and a second `unexpected` failure is
  appended to the returned error, so the value still says what happened.
- The trace viewer's own failures (a `results_filter` it cannot apply, which leaves the unmatchable traces
  out) are returned only, not told to the store's listeners: the store did not fail, so "my logging is
  failing" would be false.

**Example:** a Channels write where the IndexedDB child hits a quota error resolves
`{ ok: false, entry, error: { failures: [{ source: 'IDBLogStorage:my-app', operation: 'write', message: '…',
details: { name: 'QuotaExceededError' } }] } }`. Nothing is re-wrapped or re-described on the way up.

#### dec-failure-records-carry-no-pii
A store author never copies a caught error's message, logged data or other user-provided values into a
record: a `DOMException` message or a response body can quote the data that failed. Records carry names,
statuses and developer-written sentences only. This is enforced by review, not by the library.

**Example — averted leak:** a webhook answering 400 with `invalid payload: {"email":"a@b.com"}` produces
`details: { status: 400 }`, not the body.

### dec-failure-signal-in-memory
**`storage.onFailure(listener)` returns an unsubscribe function, and exists on stores only** — on the store
the app built and handed to its logger. It is one global "my logging is failing" hook for forwarding to a
different channel. It lives in memory because reporting a store failure through a persistent or remote
channel risks failing the same way.
- The listener receives the `LoggingError` that a failed public call on that store is about to return —
  the same object, once per failed call. It fires exactly when the result has `error`, so a partial read
  fires it once with the combined error.
- A Channels facade's failed call carries its children's failures, so the facade's listeners hear them with
  no extra machinery. Children deliver to their own (usually empty) listener sets. Listening on two objects a
  failure passes through hears it twice.
- `storage.reportInternalFailure(error)` is how `Span` and `Logger` hand their own `unexpected` failures to
  the same listeners.
- Subscriptions are identity-based: subscribing the same function twice is a no-op.
- A listener is consumer code, so it is another way to break control flow. Each runs inside its own
  `try`/`catch` and a returned promise gets a `.catch`. A listener that throws or rejects is skipped, later
  listeners still run, nothing is reported (that would be the same double failure), and the call that
  triggered delivery still returns its result.
- `ILogger` and `ISpan` have no listener API: a caller who wants to see an error reads the return value.
- Nothing is buffered: a listener subscribed after a failure does not hear it. Nothing is delivered before the
  first public call, so subscribing right after construction misses nothing.

**Example:** `storage.onFailure(error => sentry.captureMessage(error.message, { extra: error }))` at startup;
every failed write, read or reset anywhere in the app reaches Sentry once.

#### dec-listener-writes-never-deliver
A listener that logs into the failing store would recurse forever: its write fails, the failure is delivered,
the listener runs and writes again, and because each write settles in a microtask the loop never yields to
the event loop. So a module-level counter is non-zero while listeners run, and a public call **started** while
it is non-zero returns its result as normal but does not deliver its failure. The mark is taken when the call
starts, so failures that arrive later (IndexedDB, a rejecting hook) are covered.

This holds because every public call makes at most one call on a store, started before its first `await`. A
second store call made after an `await` would start outside the window, so the trace viewer reads the store
once rather than twice.

Known limit: an async listener that logs after an `await` is outside the window. The README says to report
through a different channel, never into the same store.

**Example — averted hang:** `storage.onFailure(e => span.error('logging broke', e))` on a dead IndexedDB. The
`span.error` call resolves `{ ok: false }` and nothing is delivered for it, so the listener runs once per
original failure instead of forever.

### dec-unavailable-store-fails-every-call
A store that cannot work (IndexedDB after a failed open) answers every public call with the same failure until
it can. Reads resolve with no entries rather than waiting forever.
- IndexedDB does not retry a failed open, so the failure lasts as long as the store. Each call's failure names
  that call's `operation` and carries the open's reason: `message: 'Could not open the IndexedDB database.'`,
  `details: { name: 'VersionError' }`. A runtime with no IndexedDB (server rendering, a test without a
  polyfill) fails the same way, without `details`.
- The failed open is never reported by itself (it has no caller); the first call answers it.
- The clean-up IndexedDB runs when its database opens has no caller either, so its failure is ignored and
  the store keeps recording. `forceClearOldEntries` waits for its clean-up and answers its failure.

**Example — averted hang:** a browser profile where IndexedDB is blocked. Each `get` resolves
`{ ok: false, entries: [], error }` immediately, so a trace viewer shows the error instead of a spinner that
never stops.

### dec-stores-that-retain-nothing-answer-empty
Console and Webhook hold no entries. Their `get` resolves `{ ok: true, entries: [] }` and their `reset` and
`forceClearOldEntries` resolve `{ ok: true }`. There is no "unsupported" failure, so a Channels facade needs no
special case and a viewer over a mixed facade shows the entries of the children that keep them.

**Example:** a facade over IndexedDB and Console reads as IndexedDB's entries with `ok: true`, not as a
permanent partial failure that would fire `onFailure` on every poll.

### dec-logger-never-logs-itself
No library code writes its own failures into a store. A failed log is reported through the result and
`onFailure` only; logging it through the same logger would likely fail the same way. `bestEffortSpanLog`
therefore does not write to a span whose call just failed.
- `bestEffortSpanLog` keeps its time cap and its guard: a built-in write never rejects but can be slow (a
  Webhook write waits on the network), and a span from another `ISpan` implementation may still throw. Its
  `caller` option, which only labelled the self-report, is removed rather than left as an option that does
  nothing; a call that still passes it fails to compile, and deleting `{ caller: … }` fixes it.

**Example — averted double failure:** a span over a full IndexedDB whose write fails. Writing
"logging failed" to the same span would hit the same full store.

### dec-awaited-write-means-recorded
`await span.log(...)` still means "committed or failed". Stores are called synchronously within the call
(nothing is awaited before `commitEntry`; Channels calls its children in a synchronous loop); `span_start` is
recorded synchronously in the span's constructor; IndexedDB resolves when the transaction completes, not when
the request succeeds; a Webhook write awaits its flush and its result carries any delivery failure. `fetch`
is time-boxed so an awaited write cannot hang.

**Example:** a test reads a Memory store immediately after an un-awaited `span.log(...)` and sees the entry;
code that awaits an IndexedDB write and gets `ok: true` knows a later quota abort cannot undo it.

#### dec-webhook-write-answers-for-its-own-entry
A Webhook write's result says what became of **its own entry**, not how the flush it waited on went. Writes
made together share a batch, so one write's flush can send or refuse another write's entry. The store
therefore records the outcome of each entry a write is waiting on, and each write answers with its own.
- `ok: true` only once the webhook accepted the entry (2xx). Unreachable, no answer within `TIMEOUT_MS`
  (10 s), a temporary error (429/5xx, `details: { status }`) or a refusal (any other status, `{ status }`)
  each fail the write. A refused entry is discarded; the others stay buffered and are retried after the
  back-off.
- An entry its flush did not try (the store is waiting to retry, or an earlier batch failed first) answers
  "waiting to be sent". It is never answered `ok`.
- A retry the store makes on its own timer has no caller, so it is not reported (dec-failures-as-values).
  The next write's result says how delivery is going.
- An entry that `JSON.stringify` cannot handle (a bigint in `meta`) is refused at write time and never joins
  the buffer.
- The console line the store prints for a failed delivery says only what happened and, when the webhook
  answered, its HTTP status. It never carries the webhook's URL (a Slack or Discord URL holds its token in the
  path), the caught error, or the response body (dec-failure-records-carry-no-pii).
- The store reads only the status of the webhook's answer, and releases the body unread. An answer whose body
  is long, or never finishes, neither delays the write nor holds a connection open.
- An entry is turned into JSON once, when it is written. That text is what every attempt sends, so a retry
  costs no more stringifying and sends what was written even if the caller has since changed the object.
- An entry already waiting in the buffer (same ulid) is not buffered again: each attempt sends it once, and
  every write waiting on it when the attempt is answered gets that answer. A write of it made while the store
  waits to retry is told the entry is held back, like any write made then. An entry written again after it was
  sent is sent again: delivery is at least once.

**Example — averted false success:** two writes land in one batch that the webhook refuses with 400. If each
write answered from its own flush, the second would answer `ok: true`, because its flush found the buffer
already empty. Instead both answer the refusal with `{ status: 400 }`.

**Example — averted poison batch:** an entry with a bigint in `meta` made `JSON.stringify` throw for every
batch it was in, and was retried forever, holding back every entry behind it. Now that write fails with
"Could not turn the entry into JSON", and later entries are sent.

**Example — averted leak:** a Slack webhook that is unreachable. The line printed was `Fetch failed for URL
https://hooks.slack.com/services/T…/B…/<token>`, handing the token to anything that collects console output.
It is now `Could not reach the webhook. Backing off.`

**Example — averted duplicate:** two channels of one facade route the same entry to one Webhook store. The
webhook received it twice in one batch. It now receives it once, and both writes answer `ok`.

### dec-channels-isolate-channels
**One channel's filter, transform or store failure never stops the others.**
- A write succeeds only if every matching channel recorded it; otherwise it resolves `{ ok: false, entry,
  error }` listing each failed channel's failures in channel order. A child store's own failures are listed
  unchanged; a channel whose filter, transform or `add` throws, rejects or answers with something that is
  not a write result is described by the facade itself (`channels[1] rejected instead of …`).
- Each channel gets its own copy of the entry. `structuredClone` copies it exactly; an entry it cannot copy
  (a function, a `Response`, a throwing getter or Proxy in the context) has each of its fields copied with
  `cloneToJsonSafeUnknown(field, { non_serialisable_handling: 'redact', skip_circular: true })` instead — no
  masking, no getters run. A field that cannot be copied even so (a context nested too deeply to walk)
  becomes `'redact:uncopyable'`; the other fields are kept, so the entry still shows in its trace. Every
  field is copied, including `event`: a field left shared would let one channel's transform change what the
  others record. Copying therefore never fails.
- Children still mask what they receive (keys survive, and the markers are already safe), so
  dec-channels-passthrough-children-are-boundary holds: a channel records exactly what its store records
  when written to directly. In the JSON copy, transforms see flattened values (`'redact:Function'`,
  `'redact:Date:<iso>'`).
- Per-call options that cannot be copied are dropped, so every channel masks the entry as if none were
  given (fail closed). The write then fails with the facade's own failure ("Could not copy the per-call
  options…"), listed after the channels': the caller asked for values to stay readable and must learn why
  they are masked.
- Reads ask every child, merge their entries and list their failures; `ok` only if every child succeeded
  (dec-partial-results-are-explicit). Console and Webhook children answer empty
  (dec-stores-that-retain-nothing-answer-empty). `reset` and `forceClearOldEntries` likewise reach every
  child and list every failure; `reset(entries)` gives each child only the entries its `accept` filter
  matches.

**Example — averted lost log:** `span.log('fetched', { response, parse })` where `response` is a `Response`
and `parse` a function. A single `structuredClone` of the raw context throws `DataCloneError`, so every channel
would lose the entry. Instead each channel records it, with `response` flattened to its own enumerable
properties (`{}`) and `parse` as `'redact:Function'`.

### dec-span-ids-cross-boundaries-validated
**A trace continues across a boundary by sending the span's `SpanId` (`span.getFullId()`); the receiver checks it
with `SpanIdSchema`, attaches with `continueTrace`, and logs only in a child span of its own. `SpanIdSchema` accepts
only short ids: 1 to 64 letters, digits, `-` or `_`.**

**Why:** the receiver (e.g. a browser extension's background) often trusts the sender (a web page) less than
itself, and a span id is written to the `meta` of every entry the receiver logs, which is never masked.
- **Only the ids cross.** No name or context goes with them; the receiver's child span carries its own.
- **Bounded ids, not UUID-only.** Every id the library makes is a UUID, but consumers' tests and hand-built spans use
  readable ids (`'trace-root'`). The bound still rejects what matters: an email, a huge string, spaces or
  punctuation. `SpanMetaSchema` shares the rule, which every stored entry already meets.
- **A child span, never the attached handle.** Attaching writes no `span_start`, so the child is the first span the
  receiver's store sees start. Logging only in it also stops a sender from aiming the receiver's logs at a span id of
  its choosing.
- **A bad id is the receiver's call.** One whose logging must never change an outcome drops it and starts a trace of
  its own (Authension); one that treats a malformed envelope as a protocol error refuses the request (store2). The
  schema serves both.
- **Each side keeps its own store.** They are joined by id: the receiver's store holds a trace whose root lives in the
  sender's. The React trace viewer shows each missing ancestor as a "Recorded elsewhere" span rather than failing.

**Example — averted leak:** a compromised page sends `log_span: { id: 'alice@example.com', top_id: 'x'.repeat(1e6) }`.
Unchecked, every background entry for that request carries the email in unmasked `meta`, plus a megabyte of id.
With the bounded schema both ids fail, and the background drops them and starts its own trace.

---

## Stored entries: format, migration and clean-up

A durable store (IndexedDB) outlives the library version that wrote it, and anything can write to the same
substrate. These decisions keep what a store holds, and what it returns, readable by the version that is running.
Each one's **Example** is the failure its conformance test reproduces.

### dec-log-entry-context-is-opaque
**`context` is whatever the caller logged, per entry.** Two entries in one store may hold different shapes (an
object, a string, an array, a number); no store promises a `context` type. Consumers narrow with their own type
guard (the React trace viewer renders any shape as JSON). So `createLogEntrySchema()` defaults `context` to
`z.any()`; a caller who wants a shape passes a schema.

**Example:** one store holding `logger.log('x', 5)` next to `logger.log('y', { a: 1 })` returns both intact. A
record default would reject the first, and once stores check what they read, hide it and then purge it.

### dec-log-entry-meta-is-opaque
**`meta` is the library's own slot (a span's ids), never masked, and of any shape:** the schema default and the
type are both `any`, with no record constraint.
- Its shape was never enforced on write (`add` copies it verbatim) and masking never touches it, so a record
  shape protects nothing (see dec-masker-floor-known-limitation).
- A Channels facade records `'redact:uncopyable'` in its place when it cannot be copied, so a record default
  would make the library reject its own entries.
- Readers narrow or optional-chain (`getTraces` does; a where-filter on `meta.type` simply does not match).

**Example — averted data loss:** a channel-copied entry whose `meta` is the string `'redact:uncopyable'`, hidden
by a read check and then purged by clean-up, had the default stayed a record.

### dec-log-entry-format-version
**Every stored entry carries `format_version`, a number literal stamped by the writer (`LOG_ENTRY_FORMAT_VERSION`,
currently 2).** Rejected alternative: identifying an old entry by matching it against each previous schema in
turn, because:
1. A version says which WRITER produced the record, so a record from a newer library is recognised as "newer than
   me" and left alone. A schema mismatch cannot tell "newer" from "corrupt", and would purge the newer entry.
2. An additive change (a new optional field) leaves an old record parsing under the new schema, so
   schema-matching treats it as current and never migrates it.
3. Cost: one integer comparison per record, against one parse per historic schema per record on every clean-up.

**Example:** after a downgrade, a store holding `format_version: 3` records keeps them; under schema-matching they
would be "unrecognised" and deleted.

#### dec-format-version-stamped-by-store-only
**Only `BaseLogStorage.add` stamps `format_version`, after spreading the caller's entry.** `AcceptLogEntry` cannot
carry it, and a value passed from JavaScript is overwritten.

**Example:** a Channels facade re-adds a finished entry to each child, and every child stamps it again, so a
channel's transform can never downgrade one.

### dec-store-only-holds-current-entries
**The invariant: an `ILogStorage` never holds, and never returns, a record that is not a valid entry in the
current format.** Every door enforces it, and a store never writes what it would refuse to read. The base `get`
keeps only its check on the shape of the hook's answer (`isLogReadResult`) and does not re-check each entry
(which would parse every entry twice per read): per-entry correctness is the store's job, proven by conformance.

**Example:** an interleaving of valid adds, rejected adds, a rejected reset, junk / unversioned / newer records
written straight to the substrate, and a clean-up; after it, every entry `get` returns parses under
`LogEntrySchema` with the current `format_version`.

#### dec-add-rejects-invalid-entry
**`add` checks the finished entry (masked and stamped) with `isCurrentLogEntry`** and otherwise answers
`ok: false`, operation `write`, message `'The entry is not a valid log entry.'`: nothing committed, no breakpoint
check, no console echo; listeners hear it once; the failure never quotes the entry. Checking after masking keeps
`context`/`meta` opaque: a hostile context is masked, never rejected.

**Example:** `add({ type: 'shout', message: 42 })` from JavaScript is refused, rather than recorded and then
hidden by every read.

#### dec-reset-rejects-invalid-entries
**`reset` checks every entry before its hook.** A non-array (or a sparse or unreadable one), or one invalid
entry, fails the whole call (operation `reset`, message `'Some entries are not valid log entries.'`) and the store
is unchanged. Unversioned entries are rejected, not migrated: a caller restoring a backup from an older library
maps it through `migrateLogEntry` first.

**Example:** `reset([good, { ...good, format_version: undefined }])` leaves the previous entries in place.

#### dec-read-skips-non-current-records
**`queryEntries` returns only records that carry the current version AND parse under `LogEntrySchema`.** Junk,
unversioned and newer records are skipped; the read is `ok: true` with no `error`; a read never deletes or
rewrites anything on the substrate.

**Example:** a junk row another script wrote into the same IndexedDB is neither returned nor deleted by `get`.

#### dec-newer-format-left-alone
**A record whose `format_version` is above the current one was written by a newer library.** It is skipped on
read and kept untouched (every field, including unknown ones) by clean-up. It never ages out until that library
runs again (accepted).

**Why:** two app versions share one IndexedDB during a rollout or after a downgrade.

**Example:** an older tab cleaning up after a newer one wrote `format_version: 3` entries leaves them, field for
field, for the newer tab to read.

#### dec-clean-up-migrates-or-purges
**Clean-up runs at construction (durable stores) and on `forceClearOldEntries`, in one pass over the substrate
(`decideCleanUp`):** migrate what the store migrates, purge the unrecognised (junk and unmigratable), purge the
aged, keep the newer. Atomic: a failing `max_age` test aborts the pass and changes nothing (accepted cost: while
`max_age` is broken, old-format entries stay hidden).

**Example:** an IndexedDB holding an unversioned entry, a junk row and an hour-old entry, opened with a `max_age`
of a minute, ends up holding the upgraded entry only.

#### dec-store-may-discard-instead-of-migrate
**A store may choose not to migrate.** It then declares `{ mode: 'discards-old-entries', because }` in its
conformance harness, and its clean-up must still leave the substrate free of old entries.

**Example:** a store whose substrate cannot rewrite a row in place deletes unversioned entries instead.

### dec-migration-is-one-pure-map
**`migrateLogEntry(record) → outcome` (current / migrated / newer / unrecognised), shared by every store.** A
store's clean-up is "read, map, write back". The map never throws (a hostile record is unrecognised) and never
changes its input; a migrated entry keeps every key of the record, so a substrate's row key (IndexedDB's `id`)
survives the rewrite. Each format has one file under `log-entry-schema-versions/`; older ones are frozen copies.

**Example:** IndexedDB and Memory classify the same junk row identically, because neither has its own rule.

#### dec-unversioned-is-v1
**Format 1 is an entry with no `format_version`; its `timestamp` is optional** (the field's contract allowed
discarding it in favour of the ulid's time). Upgrading stamps `format_version: 2` and fills a missing timestamp
from the ulid; with neither, it is unrecognised. The upgrade is checked against the current schema, so a faulty
step fails closed. An unversioned entry ages out exactly as a current one of the same age.

**Example:** `{ type: 'info', message: 'x', ulid: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }` becomes the same entry with
`timestamp: 1469922850259, format_version: 2`; `{ type: 'info', message: 'x', ulid: 'expired-first' }` is purged.
A trace recorded before the upgrade (two spans, a log holding a masked value) reads back through `TraceViewer`
as the same trace.

### dec-shared-substrate
**A store whose substrate several live instances can sit over at once (IndexedDB, a file, a server) declares
`substrate: { mode: 'shared' }`, and its instances are then bound by the rules below.** Conformance proves them by
minting siblings from one harness and checking the state they settle on: never an interleaving, and no timers.

**Example:** an app tab writing and a trace-viewer tab reading the same IndexedDB are two instances over one
substrate; neither owns it.

#### dec-shared-write-visibility
**An `add`, `reset` or `forceClearOldEntries` that has resolved on one instance is reflected by the next `get` on
any sibling.**

**Example:** a trace viewer tab reads what the app tab has just logged, and stops showing an entry as soon as the
app tab's clean-up has removed it.

#### dec-shared-start-up-converges
**Any number of instances constructed at once over a substrate holding old, junk, aged and newer records all serve
the same current entries.** Each upgraded entry is on the substrate exactly once; nothing is lost or duplicated;
the newer record is untouched. No lock, leader or queue is required of a store whose substrate runs writes one
after another (IndexedDB does: dec-idb-clean-up-relies-on-transaction-serialisation); a store over a substrate
that does not must provide its own mutual exclusion, and still meets this rule.

**Example — averted duplication:** two tabs opening after a library upgrade each upgrade the same unversioned
entry; had each appended its upgrade rather than rewriting the record, the substrate would hold it twice.

#### dec-shared-substrate-outlives-instances
**The substrate belongs to no instance:** an instance that stops being used leaves every entry in place for its
siblings and for instances built later.

**Example:** a store built after two others wrote sees both writes, and so do the two that wrote them.

#### dec-start-up-clean-up-before-first-answer
**A store over a substrate that can hold records from before it existed finishes its construction clean-up
(upgrade, purge, age out) before it answers any `get`, `add`, `reset` or `forceClearOldEntries`.** A call made
before then is held, in call order: never refused, never dropped, never answered from the un-cleaned substrate.
The constructor still returns at once; a consumer never awaits construction. IndexedDB meets it with no flag of
its own: the clean-up transaction is created in the open callback, before the store's connection promise
resolves, and every hook awaits that promise, so IndexedDB's own transaction order holds the calls.

**Example — averted:** a trace viewer that constructs a store and reads in the same tick shows a junk row, or an
hour-old entry that the clean-up was about to remove.

#### dec-add-preserves-call-order
**Entries one instance adds, awaited or not, come back from `get` in call order, with ascending ulids.** It binds
every store that keeps entries; it is listed here because siblings make it matter. Across siblings writing in the
same millisecond, each instance mints its own ulids, so no order between their entries is promised.

**Example:** ten un-awaited adds in a tight loop come back in the order they were called.

#### dec-clean-up-is-idempotent
**A second clean-up, by the same instance or a sibling, leaves the substrate exactly as the first did.** It binds
every store that keeps entries.

**Example:** two instances each run their construction clean-up over the same substrate; the second changes
nothing.

### dec-idb-clean-up-relies-on-transaction-serialisation
**Several IndexedDB stores over one database each run their clean-up when they open, with no lock, leader or
queue.** IndexedDB runs read-write transactions on the same object store one after another, even across
connections, and each pass is one transaction. So the passes never interleave: the first upgrades and removes,
and the later ones find every row already clean and change nothing. Rejected: `navigator.locks` (absent in Node
and in fake-indexeddb, so untestable), and `QueueIDB` from `@andymitchell/utils` (it would make `dexie` a
declared dependency, and a dead tab can hold its queue). The pass walks the object store's own cursor, not the
`timestamp` index, because an entry written without a timestamp is missing from that index. Upgraded rows are
rewritten in place under their own `id`, and the database version is never bumped for a format change: the
format is per row, and a version bump would fail every older tab's open with `VersionError`.

**Example:** two tabs opening after a library upgrade both clean up the same database; it ends up holding each
upgraded entry once, in its original row, and both tabs read the same entries.

It is about the IndexedDB store alone, so it is proven by that store's own tests, not by the conformance suite.

## Conformance suite

`src/conformance` checks every `ILogStorage` against the decisions that bind it. These decisions are the suite's
own spec.

### dec-conformance-harness-factory
**The suite is written once, against `ILogStorage`; a store's author supplies a factory that builds a harness**
(`instance`, `raw`, `capabilities`, `dispose`). One harness owns one substrate. Each test builds a fresh harness
inside its own body, with a namespace no earlier harness had (counted, never drawn from the clock or randomness),
constructs the store with the options that test is about, and disposes the harness when the test finishes.

**Example:** `runLogStorageConformance(factory)` in `IDBLogStorage-conformance.test.ts` gives the IndexedDB store
the whole battery in one line; a new store gets it the same way.

### dec-conformance-raw-only-for-substrate-claims
**Raw access to the substrate is used only where a decision speaks about what is persisted:** to place records
the store's doors would refuse (junk, entries from an older library), and to see what the store really holds.
Raw reads are untrusted (`unknown`). Everything else goes through the interface, or the suite would test how a
store is built rather than what it does.

**Example:** "a read never deletes a junk row" is checked by reading the substrate after `get`; "a refused write is
not returned" is checked through `get`.

### dec-conformance-declared-choices
**Capabilities that decide what binds a store are declared as unions with no "undeclared" arm**
(`SubstrateChoice`, `MigrationChoice`), and checked at run time too, for JavaScript or cast callers. A rule that
does not bind a store shows as a skip whose reason names what the store owes. A declaration the harness does not
back fails, never skips: absence is a checked claim.

**Example:** a harness that declares a `private` substrate but mints a new store on every `instance()` fails,
rather than silently skipping every shared-substrate rule it should have run.
