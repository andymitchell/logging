
import {  MemoryStorage } from '@andymitchell/utils/kv-storage';
import { KvStorageBreakpoints } from './KvStorageBreakpoints.ts';


import { commonBreakpointsTest } from './common-tests.ts';


commonBreakpointsTest(() => new KvStorageBreakpoints('test', new MemoryStorage()));

