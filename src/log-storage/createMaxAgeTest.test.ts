import { ulid } from "ulid";
import type { EventLogEntry, LogEntry } from "./types.ts";
import createMaxAgeTest from "./createMaxAgeTest.ts";

function createTestLogEntry(type:LogEntry['type'] = 'info', message?: string, timestampAgoMs: number = 0):LogEntry {
    
    if( type==='event' ) {
        const logEntry:EventLogEntry = {
            ulid: ulid(),
            type,
            message,
            timestamp: Date.now()-timestampAgoMs,
            event: {
                name: 'span_start'
            }
        }
        return logEntry;
    } else {
        const logEntry:LogEntry = {
            ulid: ulid(),
            type,
            message: message ?? 'Generic Message',
            timestamp: Date.now()-timestampAgoMs,
        }
        return logEntry;
    }
}

describe('catch all', () => {
    it('Retains', () => {
        const entry = createTestLogEntry();

        const filter = createMaxAgeTest([{max_ms: 1000}]);

        expect(filter(entry)).toBe(true);
    })

    it('Excludes', () => {
        const entry = createTestLogEntry(undefined, undefined, 2000);


        const filter = createMaxAgeTest([{max_ms: 1000}]);

        expect(filter(entry)).toBe(false);
    })
})

describe('filter', () => {
    it('Retains', () => {
        const entry = createTestLogEntry('error');

        const filter = createMaxAgeTest([{filter: {type: 'error'}, max_ms: 1000}]);

        expect(filter(entry)).toBe(true);

    })

    it('Excludes', () => {
        const entry = createTestLogEntry('error', undefined, 2000);

        const filter = createMaxAgeTest([{filter: {type: 'error'}, max_ms: 1000}]);

        expect(filter(entry)).toBe(false);

    })


    it('Retains if a non-matching filter', () => {
        const entry = createTestLogEntry('error', undefined, 2000);

        const filter = createMaxAgeTest([{filter: {type: 'warn'}, max_ms: 1000}]);

        expect(filter(entry)).toBe(true);

    })


})


describe('filter followed by catch all', () => {
    
    it('Excludes if between filter and catch-all', () => {
        const entry = createTestLogEntry('error', undefined, 2000);

        const filter = createMaxAgeTest([{filter: {type: 'error'}, max_ms: 1000}, {max_ms: 5000}]);

        expect(filter(entry)).toBe(false);

    })


    it('Retains if non matching and before catch all', () => {
        const entry = createTestLogEntry('error', undefined, 2000);

        const filter = createMaxAgeTest([{filter: {type: 'warn'}, max_ms: 1000}, {max_ms: 5000}]);

        expect(filter(entry)).toBe(true);

    })


    it('Retains if non matching and after catch all', () => {
        const entry = createTestLogEntry('error', undefined, 7000);

        const filter = createMaxAgeTest([{filter: {type: 'warn'}, max_ms: 1000}, {max_ms: 5000}]);

        expect(filter(entry)).toBe(false);

    })


})
