import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLogStorageConformance } from "../../conformance/index.ts";
import { malformedAcceptEntries } from "../../conformance/helpers/fixtures.ts";
import { ConsoleLogStorage } from "./ConsoleLogStorage.ts";


const CONSOLE_METHODS = ['debug', 'log', 'warn', 'error'] as const;

beforeEach(() => {
    // Keep the console quiet: every entry the suite records is written to it.
    for( const method of CONSOLE_METHODS ) vi.spyOn(console, method).mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});


runLogStorageConformance(async ({ options }) => {
    const store = new ConsoleLogStorage(options);
    return {
        capabilities: { substrate: { mode: 'none' }, migration: { mode: 'discards-old-entries', because: 'It keeps no entries.' } },
        instance: async () => store,
        dispose: async () => {},
    };
});


describe('a console store handed something that is not an entry', () => {

    it.each(malformedAcceptEntries())('never writes %s to the console', async (_label, entry) => {
        const storage = new ConsoleLogStorage();

        expect((await storage.add(entry)).ok).toBe(false);

        for( const method of CONSOLE_METHODS ) expect(console[method]).not.toHaveBeenCalled();
    });
});
