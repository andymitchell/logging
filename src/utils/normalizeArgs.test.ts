import type { InferContextTypeFromLogArgs, InferContextTypeFromLogArgsWithoutMessage } from "../types.ts";
import { normalizeArgs, type NormalizedLogArgs } from "./normalizeArgs.ts";
import { it, expect, describe, vi, afterEach, beforeEach } from 'vitest';

// A simple test harness to mimic how the logger methods would call normalizeArgs.
class TestLogger {
    log<T extends any[]>(...args: T): NormalizedLogArgs<InferContextTypeFromLogArgs<T>> {
        // The core of the test: pass the arguments array directly.
        return normalizeArgs<T>(args);
    }

    /**
     * Not used in test, just as an example of typing
     * @param message 
     * @param args 
     * @returns 
     */
    logTypedWithMessage<T extends any[]>(message: any, ...args: T): NormalizedLogArgs<InferContextTypeFromLogArgsWithoutMessage<T>> {
        return normalizeArgs([message, ...args]) as NormalizedLogArgs<InferContextTypeFromLogArgsWithoutMessage<T>>
    }
}

describe('type tests', () => {
    const logger = new TestLogger();

    it('infers free args', () => {
        const result = logger.log('hello', {world: true});
        
        result.context.world===true; // Type OK as it's boolean

        // @ts-expect-error
        result.context.nonProp;
        // @ts-expect-error
        result.context.world===1; // Type fail as it's not a boolean
    })

    it('infers message and context', () => {
        const result = logger.logTypedWithMessage('hello', {world: true});
        
        result.context.world===true; // Type OK as it's boolean

        // @ts-expect-error
        result.context.nonProp;
        // @ts-expect-error
        result.context.world===1; // Type fail as it's not a boolean
    })
})



describe('normalizeArgs', () => {
    const logger = new TestLogger();

    // --- Group 1: Standard Usage & Context Handling ---
    describe('Context Handling', () => {
        it('should handle a single string message with no context', () => {
            const result = logger.log('hello world');            
            expect(result.message).toBe('hello world');
            expect(result.context).toBeUndefined();
        });

        it('should handle a single message and a single context object', () => {
            const msg = 'User logged in';
            const context = { userId: 123, role: 'admin' };
            const result = logger.log(msg, context);
            expect(result.message).toBe(msg);
            expect(result.context).toEqual(context); // Use toEqual for deep object comparison
        });

        it('should handle a single message and a single primitive context', () => {
            const msg = 'Request ID';
            const context = 'xyz-123-abc';
            const result = logger.log(msg, context);
            expect(result.message).toBe(msg);
            expect(result.context).toBe(context);
        });

        it('should handle a single message and multiple context arguments', () => {
            const msg = 'Processing queue item';
            const context1 = { queue: 'orders' };
            const context2 = { id: 456 };
            const result = logger.log(msg, context1, context2);
            expect(result.message).toBe(msg);
            expect(result.context).toEqual([context1, context2]);
        });
    });

    // --- Group 2: Message Stringification for Various Types ---
    describe('Message Stringification', () => {
        it('should stringify a number message', () => {
            const result = logger.log(404);
            expect(result.message).toBe('404');
        });

        it('should stringify a boolean message', () => {
            const result = logger.log(false);
            expect(result.message).toBe('false');
        });

        it('should stringify a plain object message with pretty printing', () => {
            const msg = { event: 'payment_processed', transactionId: 'txn_abc' };
            const expected = JSON.stringify(msg, null, 2);
            const result = logger.log(msg);
            expect(result.message).toBe(expected);
            expect(result.context).toBeUndefined();
        });
        
        it('should stringify an array message with pretty printing', () => {
            const msg = ['item1', { detail: 'more info' }];
            const expected = JSON.stringify(msg, null, 2);
            const result = logger.log(msg);
            expect(result.message).toBe(expected);
        });

        it('should format an Error object message correctly', () => {
            const error = new Error('Database connection failed');
            error.stack = 'Error: Database connection failed\n    at db.connect (db.js:12:34)';
            const result = logger.log(error, { retryCount: 3 });
            
            expect(result.message).toContain('Database connection failed');
            expect(result.message).toContain('Stack:');
            expect(result.message).toContain('at db.connect (db.js:12:34)');
            expect(result.context).toEqual({ retryCount: 3 });
        });

        it('should handle a named function message', () => {
            function myCoolFunction() {}
            const result = logger.log(myCoolFunction);
            expect(result.message).toBe('[Function: myCoolFunction]');
        });
        
        it('should handle an anonymous function message', () => {
            const result = logger.log(() => {});
            expect(result.message).toBe('[Function: anonymous]');
        });

        it('should handle a null message', () => {
            const result = logger.log(null);
            expect(result.message).toBe('null');
        });

        it('should handle an undefined message', () => {
            const result = logger.log(undefined);
            expect(result.message).toBe('undefined');
        });
    });

    // --- Group 3: Robustness and Edge Cases (The "Break It" Suite) ---
    describe('Robustness and Edge Cases', () => {
        // Suppress console.error during known-to-fail tests
        beforeEach(() => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should not crash and return gracefully when called with no arguments', () => {
            const result = logger.log();
            expect(result.message).toBe('undefined');
            expect(result.context).toBeUndefined();
        });

        it('should handle a message object with circular references without crashing', () => {
            const circularObj: any = { name: 'I am circular' };
            circularObj.self = circularObj;
            
            const result = logger.log(circularObj);
            
            expect(result.message).toBe('[Unserializable Object]');
            expect(result.context).toBeUndefined();
            // Verify that an internal error was logged
            expect(console.error).toHaveBeenCalled();
        });

        it('should handle an object with a toJSON method that throws an error', () => {
            const badObject = {
                toJSON: () => {
                    throw new Error('Serialization failed!');
                }
            };
            const result = logger.log(badObject);
            expect(result.message).toBe('[Unserializable Object]');
            expect(console.error).toHaveBeenCalled();
        });

        it('should handle weird types in the context without crashing', () => {
            const result = logger.log('Weird context', null, undefined, () => {}, new Error('ctx error'));
            expect(result.message).toBe('Weird context');
            expect(result.context).toHaveLength(4);
            expect(result.context[0]).toBeNull();
            expect(result.context[1]).toBeUndefined();
            expect(typeof result.context[2]).toBe('function');
            expect(result.context[3]).toBeInstanceOf(Error);
        });
        
        it('should handle an empty array as a message', () => {
            const result = logger.log([]);
            expect(result.message).toBe('[]'); // JSON.stringify([]) is '[]'
        });

        it('should handle an empty object as a message', () => {
            const result = logger.log({});
            expect(result.message).toBe('{}'); // JSON.stringify({}) is '{}'
        });
    });
});