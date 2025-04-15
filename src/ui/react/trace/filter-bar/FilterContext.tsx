import type { WhereFilterDefinition } from "@andyrmitchell/objects";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { TraceFilter } from "../../../../trace/viewing/types.ts";

export type ComponentEntriesFilterData<T extends Record<string, any> = Record<string, any>> = WhereFilterDefinition<T> | undefined;
export type ComponentEntriesFilters<T extends Record<string, any> = Record<string, any>> = Record<string, ComponentEntriesFilterData<T>>;

type FilterContextType<T extends Record<string, any> = Record<string, any>> = {
    /**
     * The computed TraceFilter, used for searches
     */
    traceFilter: TraceFilter,

    /**
     * The computerd entries filter, used for searches 
     */
    entries_filter: WhereFilterDefinition<T> | undefined,

    /**
     * The filter for each component (will be combined to create the final 'filter') 
     */
    componentEntriesFilters: ComponentEntriesFilters<T>;

    /**
     * Helper function to update the filter for a component 
     * 
     * @param id 
     * @param data 
     * @returns 
     */
    setComponentEntriesFilter: (id: string, data:ComponentEntriesFilterData<T>) => void;



    /**
     * Optional string that will match anywhere in the serilalised log.
     * 
     */
    entries_full_text_search?: string;

    setEntriesFullTextSearch: (text?:string) => void;

    isInitializing: boolean;

    /**
     * Each component should register itself, so the context can calculate when everything is initialised and can start filtering. 
     * @param id 
     * @returns 
     */
    registerComponent: (id: string) => void;
};

const FilterContext = createContext<FilterContextType | undefined>(undefined);

type FilterProviderProps = React.PropsWithChildren<{
    initialComponentEntriesFilters?: ComponentEntriesFilters;
    initializedCriteria?: {
        type: 'debounce'
    } | {
        type: 'expected_components',
        expectation: number
    }
}>;

export const FilterProvider: React.FC<FilterProviderProps> = ({
    initialComponentEntriesFilters,
    initializedCriteria,
    children,
}) => {
    const [componentEntriesFilters, setComponentEntriesFilters] = useState<ComponentEntriesFilters>(initialComponentEntriesFilters || {});
    const [readyComponents, setReadyComponents] = useState<Set<string>>(new Set());
    const [isInitializing, setIsInitializing] = useState(true);
    const [entries_full_text_search, setEntriesFullTextSearch] = useState<string | undefined>();

    const registerComponent = useCallback((id: string) => {
        setReadyComponents((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    }, []);

    // Create a helper function 
    const setComponentEntriesFilter = (id:string, data:ComponentEntriesFilterData) => {
        setComponentEntriesFilters(prev => ({
            ...prev,
            [id]: data
        }))
    }

    // Calculate if everything is initialised 
    useEffect(() => {
        let timeout:ReturnType<typeof setTimeout> | undefined;
        if( initializedCriteria ) {
            const type = initializedCriteria.type;
            switch(type) {
                case 'expected_components':
                    if (readyComponents.size >= initializedCriteria.expectation) {
                        setIsInitializing(false);
                    }
                    break;
                case 'debounce':
                    timeout = setTimeout(() => {
                        setIsInitializing(false);
                    }, 200);
                    break;
                default:
                    
                    const missingType:never = type;
                    void missingType;
                    throw new Error("Unknown type");
            }
            
        } else {
            // No criteria - it's ready immediately 
            setIsInitializing(false);
        }
        return () => {
            if( timeout ) {
                // Create debounce logic
                clearTimeout(timeout);
            }
        }
    }, [readyComponents, initializedCriteria]);

    const entries_filter = useMemo(() => {
        if( isInitializing ) return undefined;

        const componentEntriesFiltersArr = Object.values(componentEntriesFilters).filter(x => !!x);
        const newFilter = componentEntriesFiltersArr.length>0? 
            {
                AND: componentEntriesFiltersArr
            }
            :
            undefined; // {}
        
        return newFilter;
    }, [componentEntriesFilters, isInitializing])

    const traceFilter:TraceFilter = useMemo(() => {
        const traceFilter:TraceFilter = {
            entries_filter: entries_filter,
            entries_full_text_search,
        }
        return traceFilter;
    }, [entries_filter, entries_full_text_search])

    const value:FilterContextType = useMemo(() => ({
        traceFilter, entries_filter, componentEntriesFilters, setComponentEntriesFilter, isInitializing, registerComponent, entries_full_text_search, setEntriesFullTextSearch
    }), [
        traceFilter, entries_filter, componentEntriesFilters, setComponentEntriesFilter, isInitializing, registerComponent, entries_full_text_search, setEntriesFullTextSearch
    ])

    return (
        <FilterContext.Provider value={value}>
            {children}
        </FilterContext.Provider>
    );
};

export const useFilterContext = <T extends Record<string, any> = Record<string, any>>(): FilterContextType<T> => {
    const context = useContext(FilterContext);
    if (!context) throw new Error("useFilterContext must be used within a FilterProvider");
    return context;
};
