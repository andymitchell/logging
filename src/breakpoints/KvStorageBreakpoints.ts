import type { WhereFilterDefinition } from "@andyrmitchell/objects";
import type { AcceptLogEntry } from "../raw-storage/types.ts";
import { uuidV4 } from "@andyrmitchell/utils/uid";
import {  type Breakpoint, type IBreakpoints } from "./types.ts";
import { BaseBreakpoints } from "./BaseBreakpoints.ts";
import { MemoryStorage, TypedStorage, type IKvStorage } from "@andyrmitchell/utils/kv-storage";



/**
 * Manage breakpoints that will callback to a handler when a filter is matched. 
 * 
 * Uses IKvStorage classes as the repository. 
 */
export class KvStorageBreakpoints extends BaseBreakpoints implements IBreakpoints {

    protected breakpoints:TypedStorage<Breakpoint>;

    /**
     * 
     * @param namespace If the storage is shared, this will narrow to a namespace.
     * @param rawStorage Defaults to MemoryStorage 
     */
    constructor(namespace:string = 'all_breakpoints', rawStorage?:IKvStorage) {
        
        super();

        this.breakpoints = new TypedStorage(rawStorage ?? new MemoryStorage(), undefined, namespace);

    }

    override async addBreakpoint(filter:WhereFilterDefinition<AcceptLogEntry>):Promise<{id:string}> {
        const id = uuidV4();
        this.breakpoints.set(id, {id, filter});
        return {id};
    }

    override async removeBreakpoint(id: string):Promise<void> {
        return this.breakpoints.remove(id);
        
    }

    override async listBreakpoints():Promise<Breakpoint[]> {
        const result = await this.breakpoints.getAll();
        return Object.values(result);
    }


}

