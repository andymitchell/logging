import React, {  useEffect, useState } from "react";
import { useFilterContext, type ComponentEntriesFilterData } from "./FilterContext.tsx";
import { isPartialObjectFilter } from "@andyrmitchell/objects/where-filter";
import type { LogEntry } from "../../../../log-storage/types.ts";
import Dropdown from "../../utils/Dropdown.tsx";
import DelayedInput from "../../utils/DelayedInput.tsx";

const COMPONENT_ID = 'time';


export const TimeDropdown: React.FC = () => {
    

    const { componentEntriesFilters, setComponentEntriesFilter, registerComponent } = useFilterContext<LogEntry>();

    useEffect(() => {
        registerComponent(COMPONENT_ID);
    }, [registerComponent]);

    const [inputValueGte, setInputValueGte] = useState<string>('');
    const [inputValueLte, setInputValueLte] = useState<string>('');

    useEffect(() => {
        const componentEntriesFilter = componentEntriesFilters[COMPONENT_ID];

        if( componentEntriesFilter && isPartialObjectFilter(componentEntriesFilter) && typeof componentEntriesFilter.timestamp==='object' ) {
            setInputValueGte((componentEntriesFilter.timestamp.gte ?? '')+'');
            setInputValueLte((componentEntriesFilter.timestamp.lte ?? '')+'');
            return;
        }
        setInputValueGte('');
        setInputValueLte('');
    }, [componentEntriesFilters]);

    const [currentValueGte, setCurrentValueGte] = useState<string>('');
    const [currentValueLte, setCurrentValueLte] = useState<string>('');


    useEffect(() => {
        const extractNumber = (str:string) => {const n = parseInt(str); return isNaN(n ?? '')? undefined : n };
        const currentValueGteInt = extractNumber(currentValueGte);
        const currentValueLteInt = extractNumber(currentValueLte);
        let data:ComponentEntriesFilterData<LogEntry> | undefined = undefined;

        if( currentValueGteInt!==undefined || currentValueLteInt!==undefined) {
            const timestamp:{gte?: number, lte?: number} = {};
            if( currentValueGteInt!==undefined ) timestamp.gte = currentValueGteInt;
            if( currentValueLteInt!==undefined ) timestamp.lte = currentValueLteInt;
            
            data = {timestamp};
        }
        console.log("Time filter", data, {currentValueGte, currentValueLte});
        setComponentEntriesFilter(COMPONENT_ID, data);
    }, [currentValueGte, currentValueLte]);
    


    return (
        <Dropdown label="Time">
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>

                <span>&gt;=</span>
                <DelayedInput
                    value={inputValueGte}
                    onChange={setCurrentValueGte}
                    delay={500}
                />

                <span>&lt;=</span>
                <DelayedInput
                    value={inputValueLte}
                    onChange={setCurrentValueLte}
                    delay={500}
                />

            </div>
        </Dropdown>
    )
};
