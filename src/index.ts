import { Logger } from "./log/Logger.ts";
import { IDBLogStorage } from "./log-storage/idb/IDBLogStorage.ts";


import { Span } from "./trace/Span.ts";
import { Trace } from "./trace/Trace.ts";

import { initiateBreakpointCommandsInDevTools } from "./breakpoints/initiateBreakpointCommandsInDevTools.ts";
import { KvStorageBreakpoints } from "./breakpoints/KvStorageBreakpoints.ts";
import  { MemoryBreakpoints } from "./breakpoints/MemoryBreakpoints.ts";
import { BaseLogStorage } from "./log-storage/BaseLogStorage.ts";
import { startTrace } from "./trace/startTrace.ts";

export {
    Trace,
    Span,
    Logger,
    BaseLogStorage,
    startTrace
}

export * from './index-universal-logstorage.ts';
export {
    IDBLogStorage,
    IDBLogStorage as IDBLogger, // Deprecated
}


export {
    MemoryBreakpoints,
    KvStorageBreakpoints,
    initiateBreakpointCommandsInDevTools
}

export * from './index-types.ts';