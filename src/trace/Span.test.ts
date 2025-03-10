import { describe, it, expect } from 'vitest';
import { Span } from './Span.ts';
import type { IRawLogger } from '../raw-storage/types.ts';
import type { MinimumContext } from '../types.ts';
import { WhereFilter, type WhereFilterDefinition } from '@andyrmitchell/objects';
import type { SpanContext } from './types.ts';

/**
 * A fake implementation of IRawLogger to be used in tests.
 * It records every log entry in an array and can be configured to fail on add() or get().
 */
class FakeRawLogger<T extends MinimumContext = any> implements IRawLogger<T, SpanContext> {
    logs: any[] = [];
    shouldFailAdd = false;
    shouldFailGetAll = false;

    async add(entry: any): Promise<void> {
        if (this.shouldFailAdd) {
            throw new Error("add failure");
        }
        // Simulate adding a timestamp (as required by LogEntry) if not provided.
        const logEntry = { ...entry, timestamp: Date.now() };
        this.logs.push(logEntry);
    }

    async get(filter?:WhereFilterDefinition): Promise<any[]> {
        if (this.shouldFailGetAll) {
            throw new Error("get failure");
        }
        if( filter ) {
            return this.logs.filter(x => WhereFilter.matchJavascriptObject(x, filter));
        }
        return this.logs;
    }
}

describe('Span Integration Tests', () => {

    it('should record span_start on creation', () => {
        const fakeLogger = new FakeRawLogger();
        // When a span is created, its constructor should record a span_start event.
        new Span(fakeLogger);
        expect(fakeLogger.logs.length).toBe(1);
        const startLog = fakeLogger.logs[0]!;
        expect(startLog.type).toBe('event');
        expect(startLog.event.name).toBe('span_start');
        expect(startLog.meta).toHaveProperty('trace');
        expect(startLog.meta.trace.id).toBeTruthy();
    });

    it('should log an info message with the correct context', async () => {
        const fakeLogger = new FakeRawLogger();
        const span = new Span(fakeLogger);
        await span.log("info message", { test: "value" });
        // Expect two entries: one from span creation and one from the info log.
        expect(fakeLogger.logs.length).toBe(2);
        const infoLog = fakeLogger.logs[1];
        expect(infoLog.type).toBe('info');
        expect(infoLog.message).toBe('info message');
        expect(infoLog.context).toEqual({ test: "value" });
        // Verify that the log entry uses the same trace id as the span's start event.
        expect(infoLog.meta.trace.id).toBe(fakeLogger.logs[0].meta.trace.id);
    });

    it('should log warn and error messages correctly', async () => {
        const fakeLogger = new FakeRawLogger();
        const span = new Span(fakeLogger);
        await span.warn("warn message", { level: "moderate" });
        await span.error("error message", { critical: true });
        // We expect three entries: span_start, warn, and error.
        expect(fakeLogger.logs.length).toBe(3);

        const warnLog = fakeLogger.logs[1];
        expect(warnLog.type).toBe('warn');
        expect(warnLog.message).toBe('warn message');
        expect(warnLog.context).toEqual({ level: "moderate" });

        const errorLog = fakeLogger.logs[2];
        expect(errorLog.type).toBe('error');
        expect(errorLog.message).toBe('error message');
        expect(errorLog.context).toEqual({ critical: true });
    });

    it('should retrieve all log entries via get()', async () => {
        const fakeLogger = new FakeRawLogger();
        const span = new Span(fakeLogger);
        await span.log("test log", { data: 123 });
        const allLogs = await span.get();
        // Expect two log entries: one from the span_start event and one from the info log.
        expect(allLogs.length).toBe(2);
        expect(allLogs[0]!.type).toBe('event');
        expect(allLogs[1]!.type).toBe('info');
    });

    it('should create a child span with the parent id set correctly', async () => {
        const fakeLogger = new FakeRawLogger();
        const parentSpan = new Span(fakeLogger);
        // Get the parent's trace id from its span_start event.
        const parentTraceId = fakeLogger.logs[0].meta.trace.id;

        // Create a child span.
        const childSpan = parentSpan.startSpan("child span");
        // The child span's constructor should immediately record its own span_start event.
        expect(fakeLogger.logs.length).toBe(2);
        const childStartLog = fakeLogger.logs[1];
        expect(childStartLog.type).toBe('event');
        expect(childStartLog.event.name).toBe('span_start');
        expect(childStartLog.meta.trace.parent_id).toBe(parentTraceId);

        // Further logging from the child span should continue to include the parent's id.
        await childSpan.log("child log");
        const childLog = fakeLogger.logs[2];
        expect(childLog.type).toBe('info');
        expect(childLog.message).toBe('child log');
        expect(childLog.meta.trace.parent_id).toBe(parentTraceId);
    });

    it('should record a span_end event when end() is called', () => {
        const fakeLogger = new FakeRawLogger();
        const span = new Span(fakeLogger);
        span.end();
        // After calling end(), we should have a span_start event and a span_end event.
        expect(fakeLogger.logs.length).toBe(2);
        const endLog = fakeLogger.logs[1];
        expect(endLog.type).toBe('event');
        expect(endLog.event.name).toBe('span_end');
    });

    it('get will return everything', async () => {
        const fakeLogger = new FakeRawLogger();
        const span = new Span(fakeLogger);
        span.log("abc1");
        span.end();

        const result = await span.get();
        
        expect(result.length).toBe(3);
        
    });

    it('get will filter', async () => {
        const fakeLogger = new FakeRawLogger();
        const span = new Span(fakeLogger);
        span.log("abc1");
        span.end();

        const result = await span.get({'type': 'info', message: 'abc1'});
        
        
        expect(result.length).toBe(1);
        const item = result[0]!;
        expect(item.type).toBe('info'); if( item.type!=='info' ) throw new Error("noop");
        expect(item.message).toBe('abc1');

        
    });

    describe('Failure Scenarios', () => {

        it('should propagate errors when storage.add fails', async () => {
            const fakeLogger = new FakeRawLogger();
            const span = new Span(fakeLogger);
            // Set the fake logger to simulate failure on subsequent add() calls.
            fakeLogger.shouldFailAdd = true;

            
            expect(span.log("fail message", {})).rejects.toThrowError('add failure')
            expect(span.warn("fail message", {})).rejects.toThrowError('add failure')
            expect(span.error("fail message", {})).rejects.toThrowError('add failure')
            expect(span.end()).rejects.toThrowError('add failure')

        });

        it('should propagate errors when storage.get fails', async () => {
            const fakeLogger = new FakeRawLogger();
            const span = new Span(fakeLogger);
            fakeLogger.shouldFailGetAll = true;
            await expect(span.get()).rejects.toThrow("get failure");
        });

    });

});
