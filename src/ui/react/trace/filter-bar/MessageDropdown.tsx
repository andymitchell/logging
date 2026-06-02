import React, { useCallback, useEffect, useMemo } from "react";
import { useFilterContext } from "./FilterContext.tsx";
import { isPartialObjectFilter } from "@andymitchell/objects/where-filter";
import { literalContains } from "./escapeRegExp.ts";
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

        if( componentEntriesFilter && isPartialObjectFilter(componentEntriesFilter) ) {
            const message = componentEntriesFilter.message;
            if( typeof message==='object' && message!==null && '$regex' in message && typeof message.$regex==='string' ) {
                return message.$regex;
            }
        }
        return '';
    }, [componentEntriesFilters])



    const onChange = useCallback((value:string) => {
        setComponentEntriesFilter(COMPONENT_ID,
            value
                ? { message: literalContains(value) }   // case-sensitive default; { caseInsensitive: true } available
                : undefined
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
