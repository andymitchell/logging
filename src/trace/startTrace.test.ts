import { MemoryLogStorage } from "../log-storage/memory/MemoryLogStorage.ts";
import type { ILogStorage } from "../log-storage/types.ts";
import { startTrace } from "./startTrace.ts";
import { Trace } from "./Trace.ts";
import type { ISpan } from "./types.ts";


// Type Tests
it('Type tests', () => {
    let logStorage: ILogStorage | undefined;
    let logSpan: ISpan | undefined;
    const a = startTrace('', {}, logStorage, logSpan); // Expect 'a' to be `ISpan | undefined` = OK
    const b = startTrace('', {}, new MemoryLogStorage(''), logSpan); // Expect 'b' to be `ISpan`, because logStorage is defintely present = FAIL (`b: ISpan | undefined`)
    const c = startTrace('', {}, logStorage, new Trace(new MemoryLogStorage(''))); // Expect 'b' to be `ISpan`, because logStorage is defintely present = FAIL (`b: ISpan | undefined`)
    const d = startTrace('', {}, undefined, new Trace(new MemoryLogStorage(''))); // Expect 'b' to be `ISpan`, because logStorage is defintely present = FAIL (`b: ISpan | undefined`)
    void a;
    void b;
    void c;
    void d;

})
