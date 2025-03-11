import type { LoggerOptions } from "../../types.ts";
import type { IRawLogger } from "../types.ts";



const DETAIL_ITEM_MESSAGE = 'Message 1';
const DETAIL_ITEM_LITERAL = {object_literal: true};
const DETAIL_ITEM_ERROR = new Error('error1');

export async function commonRawLoggerTests(generate:(options?:LoggerOptions) => IRawLogger) {

    describe('Logger', () => {
    
        test('Logger - basic', async () => {
    
            const logger = generate();
    
    
            await logger.add({
                type: 'info',
                message: DETAIL_ITEM_MESSAGE,
                context: {
                    obj: DETAIL_ITEM_LITERAL,
                    err: DETAIL_ITEM_ERROR
                }
            });
                
    
            const all = await logger.get();
    
    
            // Check values
            const entry = all[0]!;
    
    
            expect(entry.type).toBe('info'); if( entry.type!=='info' ) throw new Error("noop");
            expect(entry.message).toBe(DETAIL_ITEM_MESSAGE);
            expect(entry.context!.obj).toEqual(DETAIL_ITEM_LITERAL);
            expect(entry.context!.err instanceof Error).toBe(false);
            expect(entry.context!.err.message).toBe('error1');
        })

        describe('privacy', () => {

            test('Strips token data', async () => {
        
                const logger = generate();
        
        
                await logger.add({
                    type: 'info',
                    message: 'Includes bad token',
                    context: {
                        obj: {
                            abc: '123456789123456789',
                            _dangerousDef: '123456789123456789'
                        },
                    }
                });
                    
        
                const all = await logger.get();
        
        
                // Check values
                const entry = all[0]!;
        
    
                expect(entry.context!.obj.abc).toEqual("12...89");
                expect(entry.context!.obj._dangerousDef).toEqual("12...89"); // Note not permitted in LoggerOptions
                
            })

            test('Retains token data if marked dangerous', async () => {
        
                const logger = generate({permit_dangerous_context_properties: true});
        
        
                await logger.add({
                    type: 'info',
                    message: 'Includes bad token',
                    context: {
                        obj: {
                            abc: '123456789123456789',
                            _dangerousDef: '123456789123456789'
                        },
                    }
                });
                    
        
                const all = await logger.get();
        
        
                // Check values
                const entry = all[0]!;
                    
    
                expect(entry.context!.obj.abc).toEqual("12...89");
                expect(entry.context!.obj._dangerousDef).toEqual("123456789123456789"); 
                
            })
        })
    
        test('Logger - serialisable', async () => {
    
            const logger = generate();
    
            
            await logger.add({
                type: 'info',
                message: DETAIL_ITEM_MESSAGE,
                context: {
                    obj: DETAIL_ITEM_LITERAL,
                    err: DETAIL_ITEM_ERROR
                }
            });
    
            const all = await logger.get();
    
            const entry = all[0]!;
    
            expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
    
        })
    
        test('Logger - stack trace', async () => {
    
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
    
            const all = await logger.get();
    
            const entry = all[0]!;
    
            // Check values
            expect(entry.stack_trace!.split("\n")[0]!.includes("common.ts")).toBe(true);
        })
    
    
    })
}