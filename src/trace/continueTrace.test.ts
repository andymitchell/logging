import { describe, expect, it } from "vitest";
import { continueTrace as continueTraceDefault } from "../index.ts";
import { continueTrace as continueTraceBrowser } from "../index-browser.ts";
import { continueTrace as continueTraceNode } from "../index-node.ts";
import { MemoryLogStorage } from "../log-storage/memory/MemoryLogStorage.ts";
import type { TraceEntry } from "./types.ts";
import { continueTrace } from "./continueTrace.ts";

function createStorage(): MemoryLogStorage {
    return new MemoryLogStorage(`continue-trace-${Math.random()}`);
}

describe('continueTrace', () => {

    it('is exported from the default, browser, and node entry points', () => {
        expect(continueTraceDefault).toBe(continueTrace);
        expect(continueTraceBrowser).toBe(continueTrace);
        expect(continueTraceNode).toBe(continueTrace);
    });

    it('attaches without emitting an entry and preserves every relationship field', async () => {
        const storage = createStorage();
        const spanId = {
            id: 'received-span',
            top_id: 'trace-root',
            parent_id: 'remote-parent'
        };

        const continued = continueTrace(storage, spanId);

        expect(await storage.get()).toEqual([]);
        expect(continued.getFullId()).toEqual(spanId);
    });

    it('clones the supplied relationship before attaching it', () => {
        const storage = createStorage();
        const spanId = {
            id: 'received-span',
            top_id: 'trace-root',
            parent_id: 'remote-parent'
        };
        const continued = continueTrace(storage, spanId);

        spanId.id = 'mutated-span';
        spanId.top_id = 'mutated-root';
        spanId.parent_id = 'mutated-parent';

        expect(continued.getFullId()).toEqual({
            id: 'received-span',
            top_id: 'trace-root',
            parent_id: 'remote-parent'
        });
    });

    it('uses the continued relationship for direct logs', async () => {
        const storage = createStorage();
        const spanId = {
            id: 'received-span',
            top_id: 'trace-root',
            parent_id: 'remote-parent'
        };
        const continued = continueTrace(storage, spanId);

        await continued.log('continued work');

        const entries = await storage.get<TraceEntry>();
        expect(entries).toHaveLength(1);
        expect(entries[0]?.meta?.span).toEqual(spanId);
    });

    it('creates children and grandchildren with complete ancestry', async () => {
        const storage = createStorage();
        const continued = continueTrace(storage, {
            id: 'received-span',
            top_id: 'trace-root',
            parent_id: 'remote-parent'
        });

        const child = continued.startSpan('child');
        const grandchild = child.startSpan('grandchild');

        const entries = await storage.get<TraceEntry>();
        expect(entries).toHaveLength(2);
        expect(entries[0]?.meta?.span).toEqual({
            id: child.getId(),
            top_id: 'trace-root',
            parent_id: 'received-span'
        });
        expect(entries[1]?.meta?.span).toEqual({
            id: grandchild.getId(),
            top_id: 'trace-root',
            parent_id: child.getId()
        });
    });

});
