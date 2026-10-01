import { describe } from 'vitest';
import { runLogStorageConformance, type LogStorageHarnessFactory } from "../../conformance/index.ts";
import type { ILogStorage } from "../types.ts";
import { ChannelsLogStorage } from "./ChannelsLogStorage.ts";
import { privateMemoryHarnessFactory, sharedMemoryHarnessFactory } from "../memory/testing-helpers/memoryHarnesses.ts";


/**
 * A harness factory for a channels store with one channel, over a store from `childFactory`. The facade
 * declares what its child declares and observes the child's substrate, so the suite proves the facade passes
 * the child's guarantees through, and that what the facade refuses never reaches the child.
 */
function channelsOver(childFactory: LogStorageHarnessFactory): LogStorageHarnessFactory {
    return async params => {
        const child = await childFactory(params);
        const facadeOver = (storage: ILogStorage) => new ChannelsLogStorage(params.namespace, [{ storage }], params.options);
        // Over a shared substrate, each facade gets a new child, as each tab would build its own pair.
        const only = child.capabilities.substrate.mode === 'shared' ? undefined : facadeOver(await child.instance());
        return {
            capabilities: child.capabilities,
            instance: async () => only ?? facadeOver(await child.instance()),
            ...(child.raw ? { raw: child.raw } : {}),
            dispose: () => child.dispose(),
        };
    };
}


describe('over a store with a private substrate', () => {
    runLogStorageConformance(channelsOver(privateMemoryHarnessFactory()));
});

describe('over a store with a shared substrate', () => {
    runLogStorageConformance(channelsOver(sharedMemoryHarnessFactory()));
});
