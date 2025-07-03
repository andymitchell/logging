import { sleep } from "@andyrmitchell/utils";
import type { LogStorageOptions } from "../types.ts";
import type { ILogStorage, LogEntry } from "../types.ts";
import {test} from 'vitest';


const DETAIL_ITEM_MESSAGE = 'Message 1';
const DETAIL_ITEM_LITERAL = {object_literal: true};
const DETAIL_ITEM_ERROR = new Error('error1');

type CreateTestLogger = (options?:LogStorageOptions) => {
    logger: ILogStorage,
    cannot_recreate_with_same_data?: boolean,
    /**
     * 
     * @returns 
     */
    recreateWithSameData: () => ILogStorage
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
                const logger = createLogger({max_age: [{max_ms: aging}]}).logger;

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
                const loggerTest = createLogger({max_age: [{max_ms: aging}]});
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
                expect(entry.context!.obj._dangerousDef).toEqual("12...89"); // Note not permitted in LogStorageOptions
                
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
    
        describe('misc', () => {
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
                        debug: false,
                        info: true, 
                        warn: true, 
                        error: true,
                        critical: true,
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
                console.log(entry);
                expect(entry.stack_trace!.split("\n")[0]!.includes("common.ts")).toBe(true);
            })
        })
    
        describe('reset', () => {
    
            const sampleEntries = (count = 3): LogEntry[] =>
                Array.from({ length: count }, (_, i) => ({
                    type: 'info',
                    id: i + 1,
                    ulid: i+1+'',
                    timestamp: Date.now() + i,
                    message: `Test log ${i + 1}`,
                    context: {}
                }));
            
            test('loads entries into an empty store', async () => {
                const instance = createLogger();
                const entries = sampleEntries(3);
                await instance.logger.reset(entries);
                const result = await instance.logger.get();
        
                expect(result.length).toBe(3);
                expect(result.map(e => e.message)).toEqual([
                    'Test log 1',
                    'Test log 2',
                    'Test log 3'
                ]);
            });
        
            test('replaces existing entries with new ones', async () => {
                const instance = createLogger();
                await instance.logger.reset(sampleEntries(2));
                await instance.logger.reset(sampleEntries(1)); // only 1 new entry
        
                const result = await instance.logger.get();
                expect(result.length).toBe(1);
                expect(result[0]!.message).toBe('Test log 1');
            });
        
            test('persists data across recreated logger instances', async (cx) => {
                const instance = createLogger();
                if( instance.cannot_recreate_with_same_data ) cx.skip();
                await instance.logger.reset(sampleEntries(2));
        
                const newLogger = instance.recreateWithSameData();
                const result = await newLogger.get();
        
                expect(result.length).toBe(2);
                expect(result.map(e => e.message)).toContain('Test log 1');
                expect(result.map(e => e.message)).toContain('Test log 2');
            });
    
            
        })
    })

    
}