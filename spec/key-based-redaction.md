# Spec — Key-based redaction

Status: **proposed** (not yet built). Companion to `decisions.md` → `dec-password-shape-high-precision-only`.
Spans `@andymitchell/clone-to-json-safe` (implementation) → `@andymitchell/logging` (consumer).

## Why

The value-shape masker cannot tell a weak password (`Password1`, `Summer2024`) from a benign token of the same
shape (`Angular2`, `Windows10`, `order12345`, prose) — so it is deliberately high-precision and leaves those
readable. That leaves the real gap: a secret logged **under a telltale key** (`{ password: 'Password1' }`)
passes through unmasked.

Key-based redaction closes it the way mature tools do (pino redacts by key only; Datadog gates on a keyword
dictionary; OWASP/PCI/GDPR require redacting **all** credentials regardless of strength): **redact a value
because its FIELD NAME says it is secret — strength- and shape-agnostic.** This is the primary, compliance-grade
control; the shape net is the secondary net for un-keyed secrets in free text.

## Where

In `clone-to-json-safe`'s object walk (`internalCloneToJsonSafe` in `cloneToJsonSafe.ts`), which already has the
KEY in context and already hosts the path-based un-mask gate. NOT in `simplePrivateDataReplacer.ts` (that only
sees a value string, no key). `logging` inherits it automatically via `cloneToJsonSafeUnknown`; only a new option
needs surfacing.

## Core rule

When walking a property `key: value`, if `isSensitiveKey(key)`:
- **Redact fully to a marker** (not partial `hideToken` — the key already tells us it is a secret, so keep none
  of it). Proposed marker: `redact:sensitive-key` (fits the existing `redact:<tag>` convention; see
  `REDACT_MARKER_TAGS`).
- If the value is an **object or array, redact the whole subtree** to the single marker — you can't know which
  leaf is the secret, the key already declared the subtree sensitive, and collapsing avoids leaking field-name
  structure. Do not recurse into it.
- Scalars → the marker directly.

## Key matching — `isSensitiveKey(key)`

The #1 trap is substring matching (`password` would hit `passwordStrength`; exact match misses `db_password`).
Use **whole-token** matching:

1. **Normalize:** lowercase, split on camelCase / `_` / `-` / `.` boundaries into tokens. `x-api-key` →
   `[x, api, key]`; `dbPassword` → `[db, password]`; `client_secret` → `[client, secret]`.
2. **Tier-1 words — match if ANY token equals one of** (safe as bare tokens, low benign collision):
   `password, passwd, passphrase, secret, apikey, credential, credentials, privatekey, clientsecret,
   accesstoken, refreshtoken, sessiontoken, otp, mfa, cvv, ssn, authorization, bearer, cookie, setcookie`.
   Also match the multiword forms `pwd`, `passwd`.
3. **Tier-2 words — match only in a COMPOUND, never as the standalone token** (bare form collides badly):
   `auth` (→ `author`, `authority`), `pass` (→ `passenger`, `bypass`), `key` (→ `keyword`, `monkey`), `token`
   (→ `tokenCount`, `tokenizer`), `pin`, `sig`, `session`. Rule: a Tier-2 word counts only if it is adjacent to
   a Tier-1-ish qualifier in the same key (`api`+`key`, `access`+`token`, `x`+`api`+`key`, `refresh`+`token`,
   `private`+`key`, `client`+`secret`) — i.e. match the **pair**, not the bare word.

Consequence (intended, fail-closed): `passwordHint` → masked (a hint leaks the password — good);
`lastPasswordChange` → masked (a timestamp — harmless over-mask, and carve-out-able via the allow-list).

Configurable: `{ extra?: string[]; allow?: string[] }` to add/remove words without a code change.

## Pipeline order (in the walk, per property)

1. **Allow-list un-mask** (`preserve_unmasked_paths`, path **AND** shape gated) — may keep a value readable.
2. **Key-based deny** (this spec) — redact subtree/scalar if `isSensitiveKey`.
3. **Shape net** (`strip_sensitive_info` → `simplePrivateDataReplacer`) on the remaining scalars.

## Interactions (load-bearing)

- **Allow-list precedence + guardrail.** The existing allow-list is already safe against un-masking a real
  secret: it is path **AND** shape gated and `PreservableValueShape` is a closed set of opaque-id grammars
  (`uuid | ulid | sha256`) — no shape matches a free-form password, so an operator physically cannot un-mask a
  `password` field, only a genuine UUID/ULID at that path. **Guardrail: never add a permissive/free-text shape
  (`any`/`string`) to that closed set** — that is the one change that would turn the allow-list into a footgun.
  Optionally add a **hard-deny set** (`password`, `secret`, `private_key`, `client_secret`, `*secret*`) whose
  key-mask the allow-list cannot override at all, and/or emit an audit warning when any exemption targets a
  sensitive-keyed path.
- **`_dangerous` prefix collision.** `_dangerousApiKey` is simultaneously "un-mask me" (value-agnostic hatch,
  `allow_sensitive_in_dangerous_properties`) and "I am secret" (name). Decide precedence explicitly: for the
  hard-deny set, **the sensitive-key match WINS** over `_dangerous` (or at minimum fires a loud audit event) —
  otherwise the big-red-button hatch silently defeats the mandatory control.
- **Free-text `message` is NOT covered** — key-based only sees the structured context object. A secret in a log
  *message* string (`log("pw is " + pw)`) has no key; that surface stays shape-only, and its accepted residual
  (an un-keyed weak/wordy secret) is documented in `dec-password-shape-high-precision-only`.

## API / options (open — decide at implementation)

Proposed `CloneToJsonSafeOptions` addition:
```ts
/** Redact values whose KEY names a secret (password/secret/token/apiKey/…), regardless of the value. */
redact_sensitive_keys?: boolean | { extra?: string[]; allow?: string[] };
```
- **Default:** recommend **on** whenever `strip_sensitive_info` is on (secure-by-default, compliance control) —
  but this changes existing output, so confirm before shipping. Surface the same option on `logging`'s storage
  options / `LogCallMaskingOptions` as needed.

## Tests (intent)

- Redacts under key across shapes: `{password:'Password1'}`, `{password:'iloveyou'}`, `{apiKey:'x'}`,
  `{ db_password:'…' }`, nested `{auth:{token:'…'}}`, array element `[{secret:'…'}]`.
- Subtree: `{ credentials: { user:'u', pass:'p' } }` → single marker, no leaf recursion, no field-name leak.
- Whole-token precision: `passwordHint`/`db_password` masked; `authorName`, `passengerCount`, `tokenCount`,
  `monkeyIsland`, `keyword` NOT masked (Tier-2 bare-word collisions avoided).
- Allow-list: a `uuid`-shaped value at an allow-listed path stays readable; a `password`-keyed value cannot be
  un-masked (no matching shape); hard-deny (if built) overrides even a matching path.
- `_dangerous` precedence per decision.
- Free-text message unaffected (still shape-only).

## Open questions for review

1. Default on vs opt-in (secure-by-default vs behavior change).
2. Full redaction marker vs partial mask for scalars under a key (recommend full).
3. Build the hard-deny set + audit now, or later.
4. Exact `_dangerous`-vs-key precedence.
