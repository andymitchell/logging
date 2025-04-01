import React, { useCallback, useEffect, useMemo } from "react";
import { useFilterContext } from "./FilterContext.tsx";
import { isPartialObjectFilter } from "@andyrmitchell/objects/where-filter";
import type { LogEntry } from "../../../../raw-storage/types.ts";
import Dropdown from "../../utils/Dropdown.tsx";
import DelayedInput from "../../utils/DelayedInput.tsx";

const COMPONENT_ID = 'message';


export const MessageDropdown: React.FC = () => {
    

    const { componentFilters, setComponentFilter, registerComponent } = useFilterContext<LogEntry>();

    useEffect(() => {
        registerComponent(COMPONENT_ID);
    }, [registerComponent]);

    const inputValue: string = useMemo(() => {
        const componentFilter = componentFilters[COMPONENT_ID];

        if( componentFilter && isPartialObjectFilter(componentFilter) && typeof componentFilter.message==='object' ) {
            return componentFilter.message.contains ?? '';
        } else {
            return '';
        }
    }, [componentFilters])



    const onChange = useCallback((value:string) => {
        setComponentFilter(COMPONENT_ID, 
            value? 
            {
                message: {contains: value}
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
