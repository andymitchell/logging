## Better generics understanding 

`T extends LogEntry = LogEntry` smells funny to me. It's a pattern used widely, e.g. `LogReadResult`. I'd want to investigate when it was introduced to things like `MemoryLogStorage` by looking at the git history, and what purpose it serves. 

My gut says `LogEntry` is just one shape, and what is typed is the `C` for `context` (what was passed in - totally the consumer's call). And even then, I'd argue `C` could be different for each LogEntry even within a single store, so should perhaps be typed guarded per object. I think it was a mistake to do it that way. 

the goal is flexibility, like you can do this in chrome: `console.log("a", {a: 1})` and `console.log({b: "huh})`, and it's fine. 


## Potential things (may not be relevant)


### 1. `ChannelsLogStorage.get` de-duplicates AFTER filtering (bug fix)

#### Why
Bug found in review. On `main`, `ChannelsLogStorage.queryEntries(filter, fullText)` passes the filters down to every
child (`channel.storage.get(filter, fullTextFilter)`), then keeps one copy per ULID (last channel wins).

Each channel keeps its OWN copy of an entry, and a channel's `transform` (or its masking) can make copies differ.
Reducing to one copy per ULID interacts badly with filtering if the order is wrong:
- On `main` today the order happens to be right (children filter, then Channels dedups), so main is NOT buggy.
  But nothing states or tests that contract.
- On the branch, `queryEntries` became parameterless (base filters after upgrading stored records), so Channels read
  children unfiltered and deduped inside `queryEntries`, and the base filtered afterwards → dedup-first. The last
  channel's transformed copy hid the copy the filter was looking for: `get({ message: 'original' })` returned
  nothing. Review caught it; the fix overrode `Channels.get` to dedup after `super.get` had filtered.
- Recreate this whenever filtering moves out of the store hooks (e.g. re-doing format versioning). If you don't,
  still worth adding the tests + decision to lock the contract in.

Rule: **filter every channel's copy, then reduce to one copy per ULID.** A filter finds an entry through whichever
copy matches; when several copies match, the last channel's wins; an unfiltered read returns the last channel's copy.

#### How
Two variants, depending on where filtering lives in the new branch.

**A. Base filters after `queryEntries()` (branch design, parameterless hook).** Channels' `queryEntries` returns
every channel's copy (no dedup), and Channels overrides `get`:
```ts
public override async get<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
    const read = await super.get(filter, fullTextFilter);
    return { ...read, entries: oneCopyOfEach(read.entries) };
}
```
(`queryEntries` body = the variant-B body below minus the `filterEntries`/`oneCopyOfEach` call. Its JSDoc on the
branch: "@returns Every channel's entries, sorted oldest first. An entry several channels keep appears once per
channel, in channel order.")

**B. `queryEntries` still takes filters (main's design).** Do it all inside Channels' `queryEntries`: read children
unfiltered, merge + stable sort, filter, then dedup. (Or keep main's per-child filtering, which is already correct,
and just add the tests + decision.)

New helper `src/log-storage/filterEntries.ts` (verbatim from branch):
```ts
import { matchJavascriptObject, type WhereFilterDefinition } from "@andymitchell/objects/where-filter";
import type { LogEntry } from "./types.ts";

/**
 * Keep the entries that match a where-filter and contain a piece of text.
 *
 * @param entries The entries to search, in the order to keep.
 * @param filter Keep entries this where-filter matches; all if omitted.
 * @param fullTextFilter Keep entries whose JSON contains this text; all if omitted.
 * @returns A new array of the matching entries, in the order given.
 *
 * @remarks
 * A filter that cannot be applied to an entry throws, so the caller can fail the read that asked for it.
 */
export function filterEntries<T extends LogEntry>(entries: T[], filter?: WhereFilterDefinition<T>, fullTextFilter?: string): T[] {
    return entries.filter(entry =>
        (!filter || matchJavascriptObject(entry, filter))
        && (!fullTextFilter || JSON.stringify(entry).includes(fullTextFilter))
    );
}
```

`ChannelsLogStorage.ts` — replace `queryEntries` (adapted for main's signature):
```ts
/**
 * Retrieve the entries matching the filters from every channel, oldest first, with one copy of each entry.
 *
 * Each channel keeps its own copy of an entry, and a transform or the channel's masking can make the copies
 * differ. The filters are applied to every copy before the copies of an entry are reduced to one, so a filter
 * finds an entry through whichever channel's copy matches it. When several copies match, the last channel's
 * is returned.
 *
 * Every channel is asked, even when another fails. The result is `ok` only if every channel answered in
 * full; otherwise it lists every failure, in channel order, alongside the entries the healthy channels
 * returned.
 *
 * @param filter Match entries against this where-filter.
 * @param fullTextFilter Match entries whose JSON contains this text.
 * @returns The matching entries, one copy per ULID, sorted oldest first.
 */
protected override async queryEntries<T extends LogEntry = LogEntry>(filter?: WhereFilterDefinition<T>, fullTextFilter?: string): Promise<LogReadResult<T>> {
    const perChannel = this.channels.map((channel, index) => this.#askChannel(index, READ, () => channel.storage.get<T>(), isLogReadResult));
    const asked = await Promise.all(perChannel);

    // Sorted by ULID for chronological order across channels. The sort is stable, so the copies of one entry
    // stay in channel order.
    const entries = asked.flatMap(({ answer }) => answer?.entries ?? []);
    entries.sort((a, b) => a.ulid.localeCompare(b.ulid));

    return { ...resultFrom(asked.flatMap(({ failures }) => failures)), entries: oneCopyOfEach(filterEntries(entries, filter, fullTextFilter)) };
}
```
Module-level helper (next to the `READ`/`RESET` consts):
```ts
/**
 * Keep one copy of each entry, by ULID: the last copy, in the place of the first.
 */
function oneCopyOfEach<T extends LogEntry>(entries: T[]): T[] {
    return Array.from(new Map(entries.map(entry => [entry.ulid, entry])).values());
}
```
Notes:
- A filter that throws inside `queryEntries` is caught by the base's `#answer` and becomes a described read failure
  (same as Memory/IDB today, which filter inside their hooks).
- Check `#askChannel`'s generic typing: branch returned untyped `LogEntry`s; on main you may need `get<T>()` or a
  narrowing as in the old code.
- Optional follow-up: Memory + IDB `queryEntries` duplicate the same filter code — could call `filterEntries` too.

Tests — append to `src/log-storage/channels/ChannelsLogStorage-copying.test.ts` (helpers `entryOf`/`entriesOf`
and `MemoryLogStorage` already imported there on main). They pass on main as-is; they go red on any dedup-first
implementation, so write them before moving filtering:
```ts
describe('an app reading through a Channels facade whose channels keep different copies of an entry', () => {

    /** A facade whose first channel keeps the entry as written, and whose second rewrites its message. */
    async function facadeWithTwoCopies() {
        const facade = new ChannelsLogStorage('app', [
            { storage: new MemoryLogStorage('as-written') },
            { storage: new MemoryLogStorage('rewritten'), transform: entry => ({ ...entry, message: 'transformed' }) },
        ]);
        const written = entryOf(await facade.add({ type: 'info', message: 'original' }));
        return { facade, ulid: written.ulid };
    }

    it('finds each channel\'s copy with a where-filter that matches only that copy', async () => {
        const { facade, ulid } = await facadeWithTwoCopies();

        const original = entriesOf(await facade.get({ message: 'original' }));
        const transformed = entriesOf(await facade.get({ message: 'transformed' }));

        expect(original.map(entry => [entry.ulid, entry.message])).toEqual([[ulid, 'original']]);
        expect(transformed.map(entry => [entry.ulid, entry.message])).toEqual([[ulid, 'transformed']]);
    });

    it('finds each channel\'s copy with a full-text search that matches only that copy', async () => {
        const { facade, ulid } = await facadeWithTwoCopies();

        const original = entriesOf(await facade.get(undefined, '"original"'));
        const transformed = entriesOf(await facade.get(undefined, '"transformed"'));

        expect(original.map(entry => [entry.ulid, entry.message])).toEqual([[ulid, 'original']]);
        expect(transformed.map(entry => [entry.ulid, entry.message])).toEqual([[ulid, 'transformed']]);
    });

    it('returns one copy of the entry to an unfiltered read: the last channel\'s', async () => {
        const { facade, ulid } = await facadeWithTwoCopies();

        const all = entriesOf(await facade.get());

        expect(all.map(entry => [entry.ulid, entry.message])).toEqual([[ulid, 'transformed']]);
    });
});
```

#### Files
- `src/log-storage/filterEntries.ts` (NEW) — shared filter helper; used by Channels (and optionally Memory/IDB).
- `src/log-storage/channels/ChannelsLogStorage.ts` — `queryEntries` rewrite + `oneCopyOfEach` helper; JSDoc updated
  to state the filter-then-dedup contract.
- `src/log-storage/channels/ChannelsLogStorage-copying.test.ts` — the three tests above.
- `spec/decisions.md` — item 2 below.

---

### 2. Rule in `dec-channels-isolate-channels` (spec/decisions.md)

#### Why
Records the contract from item 1 as a design decision, so a future refactor (e.g. moving filtering into the base,
or reading children unfiltered) doesn't reintroduce dedup-before-filter.

#### How
In `spec/decisions.md`, section `### dec-channels-isolate-channels` (~line 741), add as the LAST bullet, directly
after the bullet starting "- Reads ask every child, merge their entries and list their failures; …" and before
`**Example — averted lost log:**`:
```md
- A read's filters are applied to every channel's copy of an entry before the copies are reduced to one (by
  ULID), so a filter finds an entry through whichever copy matches it; when several match, the last channel's
  wins. Reducing first would let a transformed copy hide the copy the filter was looking for.
```

#### Files
- `spec/decisions.md` — `dec-channels-isolate-channels` section only. Tests in item 1 reference this slug.
