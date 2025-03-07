import type { LoggerOptions } from "../../types.ts";
import type { IRawLogger } from "../types.ts";



const DETAIL_ITEM_MESSAGE = 'Message 1';
const DETAIL_ITEM_LITERAL = {object_literal: true};
const DETAIL_ITEM_ERROR = new Error('error1');

export async function commonRawLoggerTests(generate:(options?:LoggerOptions) => IRawLogger) {

    describe('IDBLogger', () => {
    
        test('IDBLogger - basic', async () => {
    
            const logger = generate();
    
    
            await logger.add({
                type: 'info',
                message: DETAIL_ITEM_MESSAGE,
                context: {
                    obj: DETAIL_ITEM_LITERAL,
                    err: DETAIL_ITEM_ERROR
                }
            });
                
    
            const all = await logger.getAll();
    
    
            // Check values
            const entry = all[0]!;
    
    
            expect(entry.type).toBe('info'); if( entry.type!=='info' ) throw new Error("noop");
            expect(entry.message).toBe(DETAIL_ITEM_MESSAGE);
            expect(entry.context!.obj).toEqual(DETAIL_ITEM_LITERAL);
            expect(entry.context!.err instanceof Error).toBe(false);
            expect(entry.context!.err.message).toBe('error1');
        })
    
        test('IDBLogger - serialisable', async () => {
    
            const logger = generate();
    
            
            await logger.add({
                type: 'info',
                message: DETAIL_ITEM_MESSAGE,
                context: {
                    obj: DETAIL_ITEM_LITERAL,
                    err: DETAIL_ITEM_ERROR
                }
            });
    
            const all = await logger.getAll();
    
            const entry = all[0]!;
    
            expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
    
        })
    
        test('IDBLogger - stack trace', async () => {
    
            const logger = generate({
                'include_stack_trace': {
                    info: true, 
                    warn: true, 
                    error: true,
                    event: true
                }
            });
    
            
            await logger.add({
                type: 'info',
                message: DETAIL_ITEM_MESSAGE,
                context: {
                    obj: DETAIL_ITEM_LITERAL,
                    err: DETAIL_ITEM_ERROR
                }
            });
    
            const all = await logger.getAll();
    
            const entry = all[0]!;
    
            // Check values
            expect(entry.stack_trace!.split("\n")[0]!.includes("common.ts")).toBe(true);
        })
    
    
    })
}