import { sleep } from "@andyrmitchell/utils";
import type { LoggerOptions } from "../../types.ts";
import type { IRawLogger } from "../types.ts";
import {test} from 'vitest';


const DETAIL_ITEM_MESSAGE = 'Message 1';
const DETAIL_ITEM_LITERAL = {object_literal: true};
const DETAIL_ITEM_ERROR = new Error('error1');

type CreateTestLogger = (options?:LoggerOptions) => {
    logger: IRawLogger,
    cannot_recreate_with_same_data?: boolean,
    /**
     * 
     * @returns 
     */
    recreateWithSameData: () => IRawLogger
}

export async function commonRawLoggerTests(createLogger:CreateTestLogger) {

    describe('Common Logger Tests', () => {
    
        test('Logger - basic', async () => {
    
            const logger = createLogger().logger;
    
    
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

        describe('clean up', () => {

            test('cleans before max age', async () => {
                const aging = 4;
                const logger = createLogger({max_age_ms: aging}).logger;

                await logger.add({
                    type: 'info',
                    message: DETAIL_ITEM_MESSAGE,
                    context: {
                        obj: DETAIL_ITEM_LITERAL,
                        err: DETAIL_ITEM_ERROR
                    }
                });

                await sleep(aging * 2);

                await logger.add({
                    type: 'info',
                    message: `Message 2`
                });

                await logger.forceClearOldEntries();

                const all = await logger.get();
                expect(all.length).toBe(1);
                const entry = all[0]!;

                expect(entry.type).toBe('info'); if( entry.type!=='info' ) throw new Error("noop");
                expect(entry.message).toBe('Message 2');

            })  


            test('runs clean on constructor', async (cx) => {
                const aging = 4;
                const loggerTest = createLogger({max_age_ms: aging});
                if( loggerTest.cannot_recreate_with_same_data ) cx.skip();


                await loggerTest.logger.add({
                    type: 'info',
                    message: DETAIL_ITEM_MESSAGE,
                    context: {
                        obj: DETAIL_ITEM_LITERAL,
                        err: DETAIL_ITEM_ERROR
                    }
                });

                await sleep(aging * 2);

                await loggerTest.logger.add({
                    type: 'info',
                    message: `Message 2`
                });

                const logger2 = loggerTest.recreateWithSameData();

                const all = await logger2.get();
                expect(all.length).toBe(1);
                const entry = all[0]!;

                expect(entry.type).toBe('info'); if( entry.type!=='info' ) throw new Error("noop");
                expect(entry.message).toBe('Message 2');

            })
            
        })

        describe('get filter', () => {

            describe('WhereFilter', () => {
                test('filters OK', async () => {
                    const logger = createLogger().logger;
        
            
                    await logger.add({
                        type: 'info',
                        message: DETAIL_ITEM_MESSAGE,
                        context: {
                            obj: DETAIL_ITEM_LITERAL,
                            err: DETAIL_ITEM_ERROR
                        }
                    });
                        
            
                    const filtered = await logger.get({message: DETAIL_ITEM_MESSAGE});
                    expect(filtered.length).toBe(1);
                });

                test('filter excludes non-matches', async () => {
                    const logger = createLogger().logger;
        
            
                    await logger.add({
                        type: 'info',
                        message: DETAIL_ITEM_MESSAGE,
                        context: {
                            obj: DETAIL_ITEM_LITERAL,
                            err: DETAIL_ITEM_ERROR
                        }
                    });
                        
            
                    const filtered = await logger.get({message: 'nomatchplease'});
                    expect(filtered.length).toBe(0);
                });
            })

            describe('full text', () => {
                test('filters OK', async () => {
                    const logger = createLogger().logger;
        
            
                    await logger.add({
                        type: 'info',
                        message: DETAIL_ITEM_MESSAGE,
                        context: {
                            obj: DETAIL_ITEM_LITERAL,
                            err: DETAIL_ITEM_ERROR
                        }
                    });
                        
            
                    const filtered = await logger.get(undefined, DETAIL_ITEM_MESSAGE);
                    expect(filtered.length).toBe(1);
                });
    
                test('filter excludes non-matches', async () => {
                    const logger = createLogger().logger;
        
            
                    await logger.add({
                        type: 'info',
                        message: DETAIL_ITEM_MESSAGE,
                        context: {
                            obj: DETAIL_ITEM_LITERAL,
                            err: DETAIL_ITEM_ERROR
                        }
                    });
                        
            
                    const filtered = await logger.get(undefined, 'nomatchplease');
                    expect(filtered.length).toBe(0);
                });
            })



        })

        describe('privacy', () => {

            test('Strips token data', async () => {
        
                const logger = createLogger().logger;
        
        
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
        
                const logger = createLogger({permit_dangerous_context_properties: true}).logger;
        
        
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
    
            const logger = createLogger().logger;
    
            
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
    
            const logger = createLogger({
                'include_stack_trace': {
                    info: true, 
                    warn: true, 
                    error: true,
                    event: true
                }
            }).logger;
    
            
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