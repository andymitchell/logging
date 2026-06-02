import React, { useCallback, useEffect, useMemo } from "react";
import { useFilterContext } from "./FilterContext.tsx";
import { isPartialObjectFilter } from "@andymitchell/objects/where-filter";
import type { LogEntry } from "../../../../log-storage/types.ts";
import Dropdown from "../../utils/Dropdown.tsx";
import DelayedInput from "../../utils/DelayedInput.tsx";

const COMPONENT_ID = 'message';


export const MessageDropdown: React.FC = () => {
    

    const { componentEntriesFilters, setComponentEntriesFilter, registerComponent } = useFilterContext<LogEntry>();

    useEffect(() => {
        registerComponent(COMPONENT_ID);
    }, [registerComponent]);

    const inputValue: string = useMemo(() => {
        const componentEntriesFilter = componentEntriesFilters[COMPONENT_ID];

        if( componentEntriesFilter && isPartialObjectFilter(componentEntriesFilter) && typeof componentEntriesFilter.message==='object' ) {
            return (componentEntriesFilter.message as {$regex?: string}).$regex ?? '';
        } else {
            return '';
        }
    }, [componentEntriesFilters])



    const onChange = useCallback((value:string) => {
        setComponentEntriesFilter(COMPONENT_ID, 
            value? 
            {
                message: {$regex: value}
            }
            :
            undefined
        )
    }, []);
    


    return (
        <Dropdown label="Message">
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>

                <DelayedInput
                    value={inputValue}
                    onChange={onChange}
                    delay={500}
                />

            </div>
        </Dropdown>
    )
};
