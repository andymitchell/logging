import { useState } from "react";

import type { WhereFilterDefinition } from "@andyrmitchell/objects/where-filter";



interface TraceSearchFilterProps {
    onSearch: (query: WhereFilterDefinition) => void;
}

export const TraceSearchFilter: React.FC<TraceSearchFilterProps> = ({ onSearch }) => {
    const [inputValue, setInputValue] = useState('');

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        setInputValue(e.target.value);
    };

    const handleSearch = () => {
        // Create a basic filter that searches by message.
        const filter: WhereFilterDefinition<{message?:string}> = { message: {contains: inputValue} };
        onSearch(filter);
    };

    return (
        <div style={{ marginBottom: '1rem' }}>
            <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                placeholder="Search logs..."
            />
            <button onClick={handleSearch}>Search</button>
        </div>
    );
};

