
import { commonRawLoggerTests } from "../testing-helpers/common.ts";
import { MemoryLogger } from "./MemoryLogger.ts";


beforeEach(async () => {
})

describe('IDBLogger', () => {

    commonRawLoggerTests((options) => new MemoryLogger('testing', options));


})