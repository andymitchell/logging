import React, { useCallback, useEffect, useMemo } from "react";
import { useFilterContext } from "./FilterContext.tsx";
import { isLogicFilter, isPartialObjectFilter } from "@andyrmitchell/objects/where-filter";
import type { LogEntry } from "../../../../raw-storage/types.ts";
import Dropdown from "../../utils/Dropdown.tsx";

const COMPONENT_ID = 'log-level';
const levels = ["info", "warn", "error"] as const;
type Levels = (typeof levels)[number];


export const LogLevelsDropdown: React.FC = () => {
    

    const { componentFilters, setComponentFilter, registerComponent } = useFilterContext();

    useEffect(() => {
        registerComponent(COMPONENT_ID);
    }, [registerComponent]);

    const selected: Levels[] = useMemo(() => {
        
        
        const componentFilter = componentFilters[COMPONENT_ID];
        
        if (componentFilter && isLogicFilter(componentFilter) && componentFilter['OR']) {
            
            const result = componentFilter['OR'].map(orFilter => {
                if (isPartialObjectFilter<LogEntry>(orFilter)) {
                    return orFilter.type;
                }
            }).filter(x => typeof x === 'string' && x !== 'event');
            return result;
        } else {
            return [];
        }
    }, [componentFilters])



    const toggleLevel = useCallback((level: Levels) => {

        let updated:Levels[];
        if( selected.includes(level) ) {
            updated = selected.filter(x => x!==level);
        } else {
            updated = [...selected, level];
        }

        setComponentFilter(COMPONENT_ID, 
            updated.length?
            {
                OR: updated.map(type => ({type}))
            }
            :
            undefined
        )
    }, [selected]);

    


    return (
        <Dropdown label="Levels">
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {levels.map((level) => (
                    <label key={level} style={{ display: "flex", alignItems: "center" }}>
                        <input
                            type="checkbox"
                            checked={selected.includes(level)}
                            onChange={() => toggleLevel(level)}
                            style={{ marginRight: "8px" }}
                        />
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                    </label>
                ))}
            </div>
        </Dropdown>
    )
};
