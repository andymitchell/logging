import type { WhereFilterDefinition } from "@andyrmitchell/objects";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ComponentFilterData<T extends Record<string, any> = Record<string, any>> = WhereFilterDefinition<T> | undefined;
export type ComponentFilters<T extends Record<string, any> = Record<string, any>> = Record<string, ComponentFilterData<T>>;

type FilterContextType<T extends Record<string, any> = Record<string, any>> = {
    /**
     * The final filter, used for searches 
     */
    filter: WhereFilterDefinition<T> | undefined,

    /**
     * The filter for each component (will be combined to create the final 'filter') 
     */
    componentFilters: ComponentFilters<T>;

    /**
     * Helper function to update the filter for a component 
     * 
     * @param id 
     * @param data 
     * @returns 
     */
    setComponentFilter: (id: string, data:ComponentFilterData<T>) => void;

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
    initialComponentFilters?: ComponentFilters;
    initializedCriteria?: {
        type: 'debounce'
    } | {
        type: 'expected_components',
        expectation: number
    }
}>;

export const FilterProvider: React.FC<FilterProviderProps> = ({
    initialComponentFilters,
    initializedCriteria,
    children,
}) => {
    const [componentFilters, setComponentFilters] = useState<ComponentFilters>(initialComponentFilters || {});
    const [readyComponents, setReadyComponents] = useState<Set<string>>(new Set());
    const [isInitializing, setIsInitializing] = useState(true);

    const registerComponent = useCallback((id: string) => {
        setReadyComponents((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    }, []);

    // Create a helper function 
    const setComponentFilter = (id:string, data:ComponentFilterData) => {
        setComponentFilters(prev => ({
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

    const filter = useMemo(() => {
        if( isInitializing ) return undefined;
        return {
            AND: Object.values(componentFilters).filter(x => !!x)
        }
    }, [componentFilters, isInitializing])

    return (
        <FilterContext.Provider value={{ filter, componentFilters, setComponentFilter, isInitializing, registerComponent }}>
            {children}
        </FilterContext.Provider>
    );
};

export const useFilterContext = <T extends Record<string, any> = Record<string, any>>(): FilterContextType<T> => {
    const context = useContext(FilterContext);
    if (!context) throw new Error("useFilterContext must be used within a FilterProvider");
    return context;
};
