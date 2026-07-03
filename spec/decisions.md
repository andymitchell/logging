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
