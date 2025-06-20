

import { commonRawLoggerTests } from "../testing-helpers/common.ts";
import { ChannelsLogStorage } from "./ChannelsLogStorage.ts";
import { MemoryLogStorage } from "../memory/MemoryLogStorage.ts";




describe('MemoryLogStorage', () => {

    commonRawLoggerTests((options) => ({
        logger: new ChannelsLogStorage('testing', [
            {
                storage: new MemoryLogStorage('', options)
            }
        ], options),
        cannot_recreate_with_same_data: true,
        recreateWithSameData() { throw new Error("Cannot") }
    }));


})