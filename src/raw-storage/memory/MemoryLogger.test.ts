
import { commonRawLoggerTests } from "../testing-helpers/common.ts";
import { MemoryLogger } from "./MemoryLogger.ts";


beforeEach(async () => {
})

describe('MemoryLogger', () => {

    commonRawLoggerTests((options) => ({
        logger: new MemoryLogger('testing', options),
        cannot_recreate_with_same_data: true,
        recreateWithSameData() { throw new Error("Cannot") }
    }));


})