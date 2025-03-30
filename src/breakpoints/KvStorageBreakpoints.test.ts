
import { ChromeStorage, MockChromeStorageArea } from '@andyrmitchell/utils/kv-storage';
import { KvStorageBreakpoints } from './KvStorageBreakpoints.ts';


import { commonBreakpointsTest } from './common-tests.ts';


commonBreakpointsTest(() => new KvStorageBreakpoints('test', undefined, new ChromeStorage(new MockChromeStorageArea())));

