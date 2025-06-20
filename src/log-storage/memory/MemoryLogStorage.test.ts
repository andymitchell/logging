
import { commonRawLoggerTests } from "../testing-helpers/common.ts";
import { MemoryLogStorage } from "./MemoryLogStorage.ts";


beforeEach(async () => {
})

describe('MemoryLogStorage', () => {

    commonRawLoggerTests((options) => ({
        logger: new MemoryLogStorage('testing', options),
        cannot_recreate_with_same_data: true,
        recreateWithSameData() { throw new Error("Cannot") }
    }));


})