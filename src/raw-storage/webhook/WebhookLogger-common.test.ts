
import { vi } from "vitest";
import { commonRawLoggerTests } from "../testing-helpers/common.ts";
import { FetchEmitter } from "./testing-helpers/FetchEmitter.ts";
import { WebhookLoggerForTesting } from "./testing-helpers/WebhookLoggerForTesting.ts";

let interceptor: FetchEmitter;

beforeEach(() => {
    // Set up the interceptor before each test
    interceptor = new FetchEmitter();
});

afterEach(() => {
    // Restore the original fetch after each test
    interceptor.restore();
    // Clear any pending timers
    vi.clearAllMocks();
});

describe('MemoryLogger', () => {

    commonRawLoggerTests((options) => ({
        logger: new WebhookLoggerForTesting('testing', 'https://www.whereever.com', interceptor, options),
        cannot_recreate_with_same_data: true,
        recreateWithSameData() { throw new Error("Cannot") }
    }));


})