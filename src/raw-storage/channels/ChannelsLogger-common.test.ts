

import { commonRawLoggerTests } from "../testing-helpers/common.ts";
import { ChannelsLogger } from "./ChannelsLogger.ts";
import { MemoryLogger } from "../memory/MemoryLogger.ts";




describe('MemoryLogger', () => {

    commonRawLoggerTests((options) => ({
        logger: new ChannelsLogger('testing', [
            {
                storage: new MemoryLogger('', options)
            }
        ], options),
        cannot_recreate_with_same_data: true,
        recreateWithSameData() { throw new Error("Cannot") }
    }));


})