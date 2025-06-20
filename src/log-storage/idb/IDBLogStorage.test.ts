import "fake-indexeddb/auto"; // Prevent any long-term IDB storage
import { IDBLogStorage } from "./IDBLogStorage.ts";
import { IDBFactory } from "fake-indexeddb";
import { commonRawLoggerTests } from "../testing-helpers/common.ts";
import { uuidV4 } from "@andyrmitchell/utils/uid";
import type { LogStorageOptions } from "../types.ts";



beforeEach(async () => {
    // Reset fake idb data
    indexedDB = new IDBFactory()
})

const makeLogger = (options?:LogStorageOptions) => {
    const id = `testing_${uuidV4}`;
    return {
        logger: new IDBLogStorage(id, options),
        recreateWithSameData: () => new IDBLogStorage(id, options)
    }
};

describe('IDBLogStorage', () => {

    commonRawLoggerTests(makeLogger);

    
})
