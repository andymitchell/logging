
import { vi } from "vitest";
import { ConsoleLogStorage } from "./ConsoleLogStorage.ts";
import type { LogEntry } from "../types.ts";



const consoleLogSpy = vi.spyOn(console, 'log');
const consoleErrorSpy = vi.spyOn(console, 'error');

beforeEach(() => {
    // Reset the spy before each test to ensure a clean state
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
});

afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
});

describe('ConsoleLogStorage', () => {


    it('should log the entire LogEntry when onlyData is false', async () => {
        const storage = new ConsoleLogStorage({ onlyData: false });
        
        const logEntry: LogEntry = {
            type: 'info',
            ulid: '',
            timestamp: 0,
            message: 'Test message',
            context: { key: 'value' }
        };

        // Use a private method call workaround for testing the protected method
        const finalLogEntry = await storage.add(logEntry);

        // Assert that console.log was called once
        expect(consoleLogSpy).toHaveBeenCalled();
        // Assert that console.log was called with the correct LogEntry object
        expect(consoleLogSpy).toHaveBeenCalledWith(finalLogEntry);
    });

    it('should log only the message and context when onlyData is true and context is an array', async () => {
        const storage = new ConsoleLogStorage({ onlyData: true });
        
        const logEntry: LogEntry = {
            type: 'info',
            ulid: '',
            timestamp: 0,
            message: 'Test message',
            context: [{ a: '1' }, {b: '2'}]
        };

        // Use a private method call workaround for testing the protected method
        await storage.add(logEntry);

        // Assert that console.log was called once
        expect(consoleLogSpy).toHaveBeenCalled();
        // Assert that console.log was called with the correct LogEntry object
        expect(consoleLogSpy).toHaveBeenCalledWith(logEntry.message, ...logEntry.context);


    });

    it('should log only the message and context when onlyData is true and context is not an array', async () => {
        const storage = new ConsoleLogStorage({ onlyData: true });
        
        const logEntry: LogEntry = {
            type: 'info',
            ulid: '',
            timestamp: 0,
            message: 'Test message',
            context: { a: '1' }
        };

        // Use a private method call workaround for testing the protected method
        await storage.add(logEntry);

        // Assert that console.log was called once
        expect(consoleLogSpy).toHaveBeenCalled();
        // Assert that console.log was called with the correct LogEntry object
        expect(consoleLogSpy).toHaveBeenCalledWith(logEntry.message, logEntry.context);
    });



    it('should call error with the entire LogEntry when onlyData is false, and logEntry is an error type', async () => {
        const storage = new ConsoleLogStorage({ onlyData: false });
        
        const logEntry: LogEntry = {
            type: 'error',
            ulid: '',
            timestamp: 0,
            message: 'Test message',
            context: { key: 'value' }
        };

        // Use a private method call workaround for testing the protected method
        const finalLogEntry = await storage.add(logEntry);

        // Assert that console.error was called once
        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalled();
        // Assert that console.error was called with the correct LogEntry object
        expect(consoleErrorSpy).toHaveBeenCalledWith(finalLogEntry);
    });


})