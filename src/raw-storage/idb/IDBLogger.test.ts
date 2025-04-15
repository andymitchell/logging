import "fake-indexeddb/auto"; // Prevent any long-term IDB storage
import { IDBLogger } from "./IDBLogger.js";
import { IDBFactory } from "fake-indexeddb";
import { commonRawLoggerTests } from "../testing-helpers/common.ts";
import { uuidV4 } from "@andyrmitchell/utils/uid";
import type { LoggerOptions } from "../../types.ts";



beforeEach(async () => {
    // Reset fake idb data
    indexedDB = new IDBFactory()
})

const makeLogger = (options?:LoggerOptions) => {
    const id = `testing_${uuidV4}`;
    return {
        logger: new IDBLogger(id, options),
        recreateWithSameData: () => new IDBLogger(id, options)
    }
};

describe('IDBLogger', () => {

    commonRawLoggerTests(makeLogger);

    
})
