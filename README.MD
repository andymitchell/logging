# Why not use a regular logger

Two reasons: 
1. This might be used in an environment where for security we want to own the whole stack (e.g. authorisation). 
2. We don't want heavyweight enterprise solutions, but still want the value of distributed tracing. 


# Setup

```ts
import {
  ChannelsLogStorage, IDBLogStorage, ConsoleLogStorage, WebhookLogStorage,
  Logger, startTrace, BUILT_IN_SENSITIVE_KEYS,
} from '@andymitchell/logging';
import { config } from './config';   // your app's config; holds the alert webhook URL

// 1. One store, built once at app startup. Channels fans each entry out to its children.
//    Each child masks sensitive values with its own options; the Channels facade takes none.
const masking = { sensitive_context_key_names: [...BUILT_IN_SENSITIVE_KEYS, 'myOrgToken'] };
const storage = new ChannelsLogStorage('my-app', [
  { storage: new IDBLogStorage('my-app', masking) },                          // everything, kept for the trace viewer
  { storage: new ConsoleLogStorage(masking), accept: { type: { $in: ['warn', 'error', 'critical'] } } },
  { storage: new WebhookLogStorage('my-app', config.alertWebhookUrl, masking), accept: { type: 'critical' } },
]);

// 2. The only failure hook. Forward to a channel that is not this logger.
storage.onFailure(error => reportToSentry(error));   // error is plain JSON: { message, failures: [{ source, operation, message, details? }] }

// 3a. Flat logging.
const logger = new Logger(storage);
await logger.warn('cache miss', { key });            // resolves { ok, entry?, error? }; never throws

// 3b. Tracing. A trace is a root span; children come from startSpan.
const trace = startTrace('checkout', { orderId }, storage);
const step = trace.startSpan('charge-card');
await step.log('requesting', { amount });
await step.end();
await trace.end();

// Anywhere that only holds a span (e.g. a library), extend it rather than create a new trace:
const span = startTrace('validate', undefined, undefined, parentSpan);
```


# How to cross boundaries

A trace can carry on across a process or message boundary: a web page messaging a browser extension, a worker, a
server. Send the span's id; on the other side, check it, attach to it, and do the work in a child span. Both sides
then share one trace id, while each keeps its entries in its own store.

```ts
import { continueTrace, startTrace } from '@andymitchell/logging';
import { SpanIdSchema } from '@andymitchell/logging/schemas';

// Sender: put the span's id on the message. It is only ids: { id, top_id, parent_id? }.
const span = startTrace('sign-in', undefined, pageStorage);
await sendToBackground({ name: 'authorize', body, log_span: span.getFullId() });

// Receiver: check what arrived, attach to it, and work in a child span of your own.
function spanForMessage(message: { name: string, log_span?: unknown }) {
  const received = SpanIdSchema.safeParse(message.log_span);
  return received.success
    ? continueTrace(backgroundStorage, received.data).startSpan('Received at boundary', { message: message.name })
    : startTrace('Received at boundary', { message: message.name }, backgroundStorage);   // absent or malformed
}
const hop = spanForMessage(message);
await authorize(request, hop);
```

- **Check before attaching.** `continueTrace` trusts what it is given, and span ids are written to every entry's
  `meta`, which is never masked. `SpanIdSchema` accepts only short ids (1 to 64 letters, digits, `-` or `_`), so an
  email or a huge string from a less trusted sender fails.
- **Drop a bad id rather than fail the request**, if logging must never change what your app does: start a trace of
  your own instead, as above.
- **Log only in your child span**, never on the handle `continueTrace` returns. Attaching writes nothing, so the child
  is the first span your store sees start, and a sender can't aim your logs at a span id of its choosing.
- **Each store holds its own side.** The receiver's store has a trace whose root lives in the sender's. The React
  trace viewer shows each missing ancestor as a "Recorded elsewhere" span. To see both sides together, read both
  stores and join their entries by `meta.span.top_id`.

See `dec-span-ids-cross-boundaries-validated` in [spec/decisions.md](./spec/decisions.md).


# When logging itself fails

Logging is a side effect of your app's real work, so a broken store (IndexedDB full, a webhook down, a value that can't be copied) never changes what your app does. No logging call throws or rejects. Each one resolves a result that says whether it worked:

```ts
const r = await span.warn('slow response', { ms });
if (r.error) reportLoggingBroken(r.error);   // r.entry?.ulid and r.error?.message work without narrowing
```

- **Writes** resolve `{ ok, entry?, error? }`. `entry` is there on success, and on failure whenever the entry was built. Awaiting a write means the store recorded the entry or failed to. Not awaiting it is also safe: nothing is left unhandled.
- **Reads** (`storage.get`, `viewer.getTraces`) resolve `{ ok, entries, error? }` or `{ ok, traces, error? }`. The array is always there. `ok` means *complete*: when a Channels store reads from several children and one fails, you get the healthy children's entries **and** an `error` naming the one that failed. Render first, then flag what broke:

  ```ts
  const r = await storage.get();
  setRows(r.entries);
  setBroken(r.error?.failures.map(f => f.source) ?? []);   // e.g. ['IDBLogStorage:my-app']
  ```

  `if (!r.ok) return;` throws away the entries a partial read did get.
- **`reset` / `forceClearOldEntries`** resolve `{ ok, error? }`.
- Stores that keep nothing (`ConsoleLogStorage`, `WebhookLogStorage`) read as `{ ok: true, entries: [] }`.
- A `WebhookLogStorage` write says what became of **its own** entry: sent, refused by the webhook (`details: { status }`, discarded), or kept for a retry (unreachable, no answer within 10 seconds, a temporary 429/5xx, or waiting behind an earlier retry). An entry that can't be turned into JSON fails without being sent.

**`storage.onFailure`** is the one place to hear about failures you didn't await. Subscribe once at startup, on the store you gave your logger. It only exists on stores; loggers and spans have none. The listener gets the same error the failed call returns, once per failed call.

- The error is plain JSON written by the store: no logged data, no raw exception messages. Forward it as it is.
- Send it to a **different** channel (your error reporter, a status flag). Never log it into the same store: that store is the one failing. A logging call made from inside a listener (a write, a read or a trace search) doesn't trigger the listener again, but an async listener that logs after an `await` is outside that protection.
- A failure passes up through every store it touches. Listen on a child and on its Channels facade and you hear it twice.
- Nothing is buffered: a listener added after a failure doesn't hear it.
- Writing your own store (extending `BaseLogStorage`)? Answer a hook that failed with `createLoggingFailedResult({ source: 'MyStore:my-app', operation: 'write', message: 'Could not record the entry.' })`, so your failures look like every other store's.

**`bestEffortSpanLog(span, s => s.log(...))`** is for logging as a side note to other work. It waits at most a second (`{ timeoutMs }` to change it) and does nothing when `span` is `undefined`. Call the span directly when you need the result.


# Stored entries and upgrades

A store only ever holds, and only ever returns, valid entries in the current format. Every entry carries `format_version` (`LOG_ENTRY_FORMAT_VERSION`), stamped by the store when it records the entry; a caller can't set it.

- **`add` and `reset` refuse anything that is not an entry.** A malformed entry (a non-string `message` or an unknown `type`, passed from JavaScript or through a cast) resolves `{ ok: false, error }` and is never recorded; `onFailure` hears it. `reset` fails as a whole if any entry is not a valid current entry, and the store keeps what it had.
- **`get` skips records it can't read.** An IndexedDB database can hold rows written by an older version of this library, by a newer one, or by another script. `get` returns only current entries, and is still `ok`. Reading never changes or removes anything.
- **Clean-up upgrades and removes.** When an `IDBLogStorage` opens, and whenever you call `forceClearOldEntries`, the store upgrades entries from older formats in place, removes records it can't read, and removes entries older than `max_age`, in one pass. Calls made while it is opening wait for it. Several tabs opening one database at once are safe: each entry ends up there exactly once. Traces recorded before an upgrade still show.
- **Entries are kept until you set `max_age`.** The default, `[]`, keeps them for good. Each rule is a `max_ms`, optionally with a `filter`; the first rule that matches an entry decides, and an entry no rule matches is kept. Clean-up applies them.

  ```ts
  const DAY = 24 * 60 * 60 * 1000;

  new IDBLogStorage('my-app', { max_age: [{ max_ms: 30 * DAY }] });

  // Errors for 90 days, everything else for 7
  new IDBLogStorage('my-app', { max_age: [{ filter: { type: 'error' }, max_ms: 90 * DAY }, { max_ms: 7 * DAY }] });
  ```
- **Records from a newer version are left alone.** After a downgrade, or while two versions of an app share one database, the older library neither returns nor deletes what the newer one wrote. Those records don't age out until the newer version runs again.
- **`context` and `meta` are whatever was logged.** One store can hold a string context next to an object one. Narrow them before use. `LogEntrySchema` accepts any value for both, unless you pass schemas to `createLogEntrySchema`.

Restoring entries saved by an older version? `reset` accepts only current entries, so upgrade them first:

```ts
import { migrateLogEntry } from '@andymitchell/logging';

const entries = backup.flatMap(record => {
  const outcome = migrateLogEntry(record);   // status: 'current' | 'migrated' | 'newer' | 'unrecognised'
  return outcome.status === 'current' || outcome.status === 'migrated' ? [outcome.entry] : [];
});
await storage.reset(entries);
```

**Writing your own store?** Extend `BaseLogStorage`: it stamps `format_version`, and refuses invalid entries in `add` and `reset`, for you. Then:

- In `queryEntries`, keep only `rows.filter(isCurrentLogEntry)` before matching the filters.
- In `clearOldEntries`, pass each record to `migrateLogEntry`: keep a `current` entry and write a `migrated` one back in place of its record (unless either is older than `max_age`), leave a `newer` record untouched, and delete an `unrecognised` one. Make the pass all or nothing.
- If your substrate outlives the store (a database, a file, a server), clean up as the store opens, before it answers any call.
- Answer a hook that failed with `createLoggingFailedResult(...)`.

The built-in stores are checked against each of these rules by a conformance suite (`src/conformance`), which is not yet part of the package. See the stored-entries decisions in [spec/decisions.md](./spec/decisions.md).


# Upgrading to 0.18.0

Entries carry a format version, and stores refuse, skip or clean up anything that is not a valid current entry. See [Stored entries and upgrades](#stored-entries-and-upgrades).

| 0.17 | 0.18 |
|---|---|
| `LoggingOk`, `LoggingFailed` | `LoggingOkResult`, `LoggingFailedResult` (the old names still work, deprecated) |
| a `LogEntry` you build yourself (test fixtures, a fake store) | add `format_version: LOG_ENTRY_FORMAT_VERSION` |
| `add` records a malformed entry (from JavaScript or a cast) | it resolves `{ ok: false, error }` and records nothing |
| `reset(entries)` stores whatever it is given | it fails as a whole, leaving the store unchanged, if any entry is not a valid current entry; run a backup from an older version through `migrateLogEntry` first |
| `IDBLogStorage` removes entries older than `max_age` when it opens and on `forceClearOldEntries` | it also upgrades older entries in place and removes rows it can't read |
| `get` returns whatever the store holds | it skips anything that is not a valid current entry |
| `LogEntrySchema` requires `context` and `meta` to be objects | it accepts any value for both; `LogEntry`'s second type parameter (`meta`) no longer has to be an object type |

- **`LogEntrySchema` and `TraceSearchResultsSchema` reject entries written by an older version**, which have no `format_version`. If you validate entries or traces that crossed a boundary (to a UI, a worker, a server), upgrade both sides together, or run each entry through `migrateLogEntry` first.
- **Use `@andymitchell/logging-ui-react` 0.4.0 or later.** It only reads entries, so the format version changes nothing for it; 0.4.0 is the first version that reads `getTraces`' `{ ok, traces }` result (see [Upgrading to 0.15.0](#upgrading-to-0150)). Fixtures of your own that build `LogEntry` literals need the `format_version` field.
- **The main entry now loads zod**, to check entries. Nothing new is installed (zod is a required peer) and the where-filter already loaded it.
- **Store authors** can import `createLoggingFailedResult`, `migrateLogEntry`, `isCurrentLogEntry` and `LOG_ENTRY_FORMAT_VERSION`. See "Writing your own store?" above.


# Upgrading to 0.15.0

Every logging call now resolves a result instead of a bare value, and never throws or rejects. (0.14.0 has the same API as 0.13.)

| 0.13 and 0.14 | 0.15 |
|---|---|
| `const entry = await logger.log(...)` | `const { entry } = await logger.log(...)` (`entry` may be `undefined` on failure) |
| `const entries = await storage.get(...)` | `const { entries } = await storage.get(...)` |
| `const traces = await viewer.getTraces(...)` | `const { traces } = await viewer.getTraces(...)` |
| a failing store makes writes, reads and `reset` throw or reject, and `startSpan` throw or leave an unhandled rejection | calls resolve `{ ok: false, error }` and `startSpan` returns a working span; read `error`, or subscribe with `storage.onFailure` |
| `.catch(() => undefined)` / `try` around logging calls | not needed |
| `bestEffortSpanLog(span, op, { caller })` | `bestEffortSpanLog(span, op)`: `caller` is removed |

- A store you wrote yourself (including test fakes of `ILogStorage`) needs `onFailure(listener) → unsubscribe` and `reportInternalFailure(error)`, and must resolve results. `Logger`, `Span` and `Trace` throw straight away if given a store without those two methods. Extending `BaseLogStorage` provides them.
- Fakes of `ILogger` / `ISpan` must resolve results from their writes and `get`.
- **Requires `@andymitchell/logging-ui-react` 0.4.0 or later.** Older UIs install without complaint but fail at runtime, because `getTraces` no longer resolves an array. Upgrade both packages together.


# React UI

The React trace viewer is a separate package, `@andymitchell/logging-ui-react`. It takes this package, `react` and `react-json-view-lite` as peers, so apps that don't render traces never install React.

```bash
npm install @andymitchell/logging-ui-react @andymitchell/logging react react-json-view-lite
```

Wrap the storage your traces were written to in a `TraceViewer` and pass it to the UI:

```tsx
import { IDBLogStorage } from '@andymitchell/logging';
import { TraceViewer } from '@andymitchell/logging/get-traces';
import { TraceInspector } from '@andymitchell/logging-ui-react';

const viewer = new TraceViewer(new IDBLogStorage('my-app'));

export const Traces = () => <TraceInspector tracesSource={viewer} template="neutral" />;
```

Logging 0.15.0 and later need `@andymitchell/logging-ui-react` 0.4.0 or later; see [Upgrading to 0.15.0](#upgrading-to-0150).

The `@andymitchell/logging/react` entry point was removed in 0.13.0. Replace `from "@andymitchell/logging/react"` with `from "@andymitchell/logging-ui-react"`; the exported components are unchanged.




# Roadmap

## Export the test helpers

- **The `ILogStorage` conformance suite**, as `@andymitchell/logging/conformance`, so the author of any store can prove it meets the stored-entry rules. It lives in `src/conformance` and needs only vitest, zod, ulid and this package's own format code.
- **Failing test stores**, as `@andymitchell/logging/testing`: stores that refuse writes, throw, or fail reads, for testing how an app copes when logging fails. Authension, store2 and GTDInbox each build their own today.

## Optimise package size

### Work on the upstream @andyrmitchell/objects to make sure that importing @andyrmitchell/objects/where-filter will not import zod

At least not after being tree-shaken. Try compiling this with iife and tree-shaking.

On its own this no longer keeps zod out: since 0.18.0 the main entry loads zod to check entries.

## Rethink the debugger

A lot of times it'll run in an environment without UI (e.g. service worker). 
Need to control from command line. 

I imagine a flow to be like: 
* It's been set up in the service worker, and I can 'unpack' it to use it, e.g. with globalThis._begin (probably defined per app)
* That exposes a common object that has addBreakpoint, removeBreakpoint (if none provided, it lists them and prompts you to choose), listBreakpoints in it
    * It probably has some kind of serialisation, or perma storage (key store), to handle refreshes
* In the prettier UI I can be listing them, then adding them 


## Integrate into AIB

What it benefits from: 
* Being able to just list errors
* Being able to match any object 

* Put in a popup modal
* Wrap the client side session to get traces 
