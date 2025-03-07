import "fake-indexeddb/auto"; // Prevent any long-term IDB storage
import { IDBLogger } from "./IDBLogger.js";
import { IDBFactory } from "fake-indexeddb";
import { commonRawLoggerTests } from "../testing-helpers/common.ts";


beforeEach(async () => {
    // Reset fake idb data
    indexedDB = new IDBFactory()
})

describe('IDBLogger', () => {

    commonRawLoggerTests((options) => new IDBLogger('testing', options));


})