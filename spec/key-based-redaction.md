# Spec — Key-based redaction

Status: **accepted** — built and shipped in `@andymitchell/clone-to-json-safe` **0.4.0**, consumed by
`@andymitchell/logging`. Companion to `decisions.md` → `dec-key-based-redaction`,
`dec-key-tokenizer-linear`, `dec-spread-gate-dos-hardening`, `dec-password-shape-high-precision-only`.
Spans `clone-to-json-safe` (implementation) → `logging` (consumer).

## Why

The value-shape masker cannot tell a weak password (`Password1`, `Summer2024`) from a benign token of the same
shape (`Angular2`, `Windows10`, `order12345`, prose) — so it is deliberately high-precision and leaves those
readable (`dec-password-shape-high-precision-only`). That leaves the real gap: a secret logged **under a
telltale key** (`{ password: 'Password1' }`) passes through unmasked.

Key-based redaction closes it the way mature tools do (pino redacts by key; Datadog gates on a keyword
dictionary; OWASP/PCI/GDPR require redacting **all** credentials regardless of strength): **redact a value
because its FIELD NAME says it is secret — strength- and shape-agnostic.** This is the primary, compliance-grade
control; the shape net is the secondary net for un-keyed secrets in free text.

## Where

In `clone-to-json-safe`'s object walk (`internalCloneToJsonSafe` in `cloneToJsonSafe.ts`), which already has the
KEY in context and hosts the path-based un-mask gate. NOT in `simplePrivateDataReplacer.ts` (that only sees a
value string, no key). The matcher lives in its own deep module `sensitiveKeys.ts`. `logging` inherits the
behaviour automatically via `cloneToJsonSafeUnknown`; it surfaces two options (see API).

## Core rule

When walking a property `key: value`, if the key is sensitive (see Matching) and redaction is active (see
Activation), the property is replaced with the marker `redact:sensitive-key` **without the value ever being
read**:

- Scalars → the marker directly.
- **Object / array values → the whole subtree collapses to the single marker.** The clone does not recurse: you
  can't know which leaf is the secret, the key already declared the subtree sensitive, and collapsing avoids
  leaking field-name structure. A getter under a sensitive key therefore never executes, and no work is done on
  attacker-sized nested data.

The marker fits the existing `redact:<tag>` convention. `sensitive-key` is registered in `REDACT_MARKER_TAGS`
and is the one hyphenated tag, so `REDACT_MARKER_RE`'s tag class admits an interior hyphen; recognising it keeps
a re-clone idempotent (an already-redacted marker is returned verbatim, never re-masked).

## Matching — whole-token, contiguous-sublist (as built)

The #1 trap is substring matching (`password` would falsely hit `passwordless`; a naive exact match misses
`db_password`). The built matcher is whole-token, and — unlike the originally-proposed Tier-1/Tier-2 word lists
— needs no per-word tiering, because multi-word names are inherently compound-safe:

1. **Tokenize** (`tokenizeKey`): split on camelCase / acronym / `_` / `-` / `.` / any non-alphanumeric run, and
   lowercase. `dbPassword` → `[db, password]`; `x-api-key` → `[x, api, key]`; `APIKey` → `[api, key]`;
   `apikey` → `[apikey]`. Implemented as a single linear character scanner (see Robustness), not a regex.
2. **A sensitive name matches** iff its tokens are a **contiguous sublist** of the key's tokens, OR — when the
   key is a single solid lowercase run — that run equals the name's tokens joined (`solid`). So:
   - single-word names match as whole tokens: `password` → `dbPassword` ✓, `password_hash` ✓, but `passwordless` ✗;
   - multi-word names are compound-safe with no tiering: `apiKey` → `api_key` / `x-api-key` / `apikey` ✓, but a
     bare `key` ✗ (a lone tail of a multi-word phrase never matches);
   - no substring false positives: `ssn` → `userSsn` ✓ but `lesson` ✗.

**Built-in list (conservative core):** `password, passwd, passphrase, pwd, secret, apiKey, accessToken,
refreshToken, privateKey, clientSecret, credential, credentials, authorization, ssn, cvv, otp`. Kept small so
on-by-default has near-zero false positives on ordinary logs.

**Customisation** is list-REPLACE, not merge: supplying `sensitive_key_names` replaces the built-in list
outright. To EXTEND, spread the exported `BUILT_IN_SENSITIVE_KEYS`. Two kinds of supplied name are dropped as
unusable: empty / all-punctuation (would tokenize to nothing and match every key), and **purely numeric** (`'0'`,
`'123'` — a bare number can only match a structural array index or numeric object key, never a semantic secret
FIELD; see Robustness).

## Activation & precedence (as built)

- **Prerequisite — `strip_sensitive_info`.** With masking off, `clone-to-json-safe` stays a plain JSON cloner and
  never inspects keys. `logging` hardcodes `strip_sensitive_info: true`, so key-redaction is live for every sink.
- **On by default.** `redact_sensitive_keys` defaults to `true` (when stripping is on). An explicit
  `undefined` never disables it — `resolveOptions` guards every option whose default is non-`undefined`, so a
  programmatically-built `{ redact_sensitive_keys: cfg.x }` with an undefined `cfg.x` falls back to the default
  rather than silently failing open. Pass `false` to disable while keeping value-shape masking.
- **`_dangerous` hatch → preserved.** A `_dangerous`-prefixed key with `allow_sensitive_in_dangerous_properties`
  on is NOT key-redacted (consistent with the value masker; the hatch exists for deliberate exposure). Default
  off, so the default path redacts.
- **Preserve allow-list (`preserve_unmasked_paths`) → key-redaction WINS.** This INVERTS the pipeline order in
  the original proposal. Structurally the key check precedes leaf resolution, so a sensitive-keyed value is
  redacted even at an allow-listed path. Rationale: the allow-list only preserves non-secret opaque shapes
  (`uuid`/`ulid`/`sha256`) and a real secret value is ~never uuid-shaped, so the conflict is rare and resolving it
  toward redaction is the safe, compliance-driven default. (If an explicit allow-list entry should ever win, that
  is a deliberate future change, not the current behaviour.)

## API / options

**`clone-to-json-safe` (`CloneToJsonSafeOptions`):**
```ts
/** Redact a value whose KEY names a secret, regardless of shape. Gated by strip_sensitive_info. @default true */
redact_sensitive_keys?: boolean;
/** REPLACES the built-in list; omit for BUILT_IN_SENSITIVE_KEYS; spread it to extend. */
sensitive_key_names?: readonly string[];
```
`BUILT_IN_SENSITIVE_KEYS` is exported.

**`logging` (`LogStorageOptions`)** surfaces the same two, named to match its `_context_` convention
(alongside `preserve_unmasked_context_paths`, `permit_dangerous_context_properties`):
```ts
redact_sensitive_context_keys?: boolean;          // @default true
sensitive_context_key_names?: readonly string[];  // @default BUILT_IN_SENSITIVE_KEYS
```
`BaseLogStorage.prepareContext` threads them into `cloneToJsonSafeUnknown` beside the hardcoded
`strip_sensitive_info: true`. Both are masking CONFIG, so `ChannelsLogStorage` omits them from its options type
(the fan-out facade never masks — each child storage applies its own). `BUILT_IN_SENSITIVE_KEYS` is re-exported
from `logging` so consumers can extend without a deep import. Per-call (`LogCallMaskingOptions`): NOT surfaced —
per-call masking is fail-closed ALLOW-only, so a per-call deny/enable toggle does not fit.

**Behaviour change:** consumers upgrading to this version now get `password`/`secret`/`apiKey`/`ssn`-keyed context
values (and their subtrees) → `redact:sensitive-key` by default. Disable per-storage via
`redact_sensitive_context_keys: false`; customise via `sensitive_context_key_names`.

## Robustness (as built)

- **Linear tokenizer, no ReDoS.** `tokenizeKey` is a single O(n) character scanner. The originally-obvious
  acronym regex `/([A-Z]+)([A-Z][a-z])/g` backtracks quadratically on a long all-caps key (≈6s at 64k chars) — a
  DoS on untrusted JSON keys. The scanner was proven token-for-token identical to that regex across ~550k inputs
  incl. a near-exhaustive char-class proof (`dec-key-tokenizer-linear`), and is guarded by a perf regression test.
- **A sensitive value is never read — including during preserve-path resolution.** The walk short-circuits before
  reading, and `resolveConcretePreservePaths` (which fires getters along configured preserve patterns) SKIPS any
  path whose segment the walk would redact — so a getter beneath a sensitive key is never fired even there. The
  skip uses the FULL activation predicate (not a bare name match), so a `_dangerous`-hatched path — which the walk
  does NOT redact — still resolves and preserves its value (`dec-spread-gate-dos-hardening`).
- **Array `length` is a structural slot.** `Reflect.ownKeys(array)` includes `length`; the walk bypasses BOTH
  key-redaction and value-masking for it (reading the raw numeric length via descriptor), so a custom
  `['length']` name can't assign a marker to `arr.length` (RangeError) and a large sparse array's length isn't
  masked into a non-number. Same principle underlies dropping purely-numeric sensitive names: numeric positions
  are structure, not secrets.

## Interactions (load-bearing)

- **Allow-list guardrail.** `PreservableValueShape` is a closed, named set of opaque-id grammars
  (`uuid | ulid | sha256`) — no shape matches a free-form password, so an operator physically cannot un-mask a
  `password` field via the allow-list, only a genuine UUID/ULID/SHA-256 at a path. **Never add a permissive
  free-text shape (`any`/`string`) to that set** — that is the one change that would turn the allow-list into a
  footgun. (And per Precedence, a sensitive KEY overrides the allow-list regardless.)
- **`_dangerous` collision.** `_dangerousApiKey` is simultaneously "un-mask me" (value-agnostic hatch) and "I am
  secret" (name). The hatch wins **only when explicitly enabled** (`allow_sensitive_in_dangerous_properties`,
  default off); the default path redacts. This is the deliberate-exposure escape valve, chosen consistently with
  the value masker.
- **Free-text `message` is NOT covered** — key-based only sees the structured context object. A secret in a log
  *message* string (`log("pw is " + pw)`) has no key; that surface stays shape-only, and its accepted residual (an
  un-keyed weak/wordy secret) is documented in `dec-password-shape-high-precision-only`.

## Tests (intent)

- **Redacts under key across shapes:** `{password:'Password1'}`, `{apiKey:'x'}`, `{ db_password:'…' }`, nested
  `{credentials:{user,pass}}` → single marker with no leaf recursion and no field-name leak.
- **Whole-token precision:** `dbPassword` / `password_hash` / `x-api-key` / `userSsn` masked; `passwordless`,
  `lesson`, `keyword`, `authorName`, bare `key`/`token` NOT masked.
- **Activation:** off when `strip_sensitive_info` off; `redact_sensitive_keys:false` disables (value net still
  runs); explicit `undefined` still redacts (no fail-open).
- **Customisation:** `sensitive_key_names` replaces; spreading `BUILT_IN_SENSITIVE_KEYS` extends; a purely-numeric
  name is inert (does not redact array elements).
- **Precedence:** `_dangerous`+hatch preserves; an allow-listed uuid AT a sensitive key is still redacted.
- **Robustness:** a 100k-char key tokenizes under a small ms bound; a getter under a sensitive key (incl. at a
  preserve path) never fires; `sensitive_key_names:['length']` and a large sparse array both clone without throwing.
- **logging:** `{password:'Password1'}` context redacted by default; `redact_sensitive_context_keys:false` restores
  it; the options-spoofing / per-call-masking guarantees are unaffected (their fixtures use benign keys).
- **Free-text message unaffected** (still shape-only).

## Deferred (spec'd, not built)

- A hard-deny set the allow-list can never override, plus an audit warning when an exemption targets a
  sensitive-keyed path. Not needed given the closed-shape allow-list + key-redaction-wins precedence, but recorded
  as the escalation path if a free-text shape is ever demanded.
- Per-call enable/deny — does not fit the fail-closed ALLOW-only per-call model.
