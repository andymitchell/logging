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
- **Requires `@andymitchell/logging-ui-react` 0.3.0 or later.** Older UIs install without complaint but fail at runtime, because `getTraces` no longer resolves an array. Upgrade both packages together.


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

Logging 0.15.0 needs `@andymitchell/logging-ui-react` 0.3.0 or later; see [Upgrading to 0.15.0](#upgrading-to-0150).

The `@andymitchell/logging/react` entry point was removed in 0.13.0. Replace `from "@andymitchell/logging/react"` with `from "@andymitchell/logging-ui-react"`; the exported components are unchanged.




# Roadmap

## Optimise package size

### Work on the upstream @andyrmitchell/objects to make sure that importing @andyrmitchell/objects/where-filter will not import zod

At least not after being tree-shaken. Try compiling this with iife and tree-shaking.

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
