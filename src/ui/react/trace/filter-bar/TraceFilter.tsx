
import { FullTextSearchDropdown } from "./FullTextSearchDropdown.tsx";
import { LogLevelsDropdown } from "./LogLevelsDropdown.tsx";
import { MessageDropdown } from "./MessageDropdown.tsx";


interface TraceFilterProps {
    //onSearch: (query: WhereFilterDefinition) => void;
}

export const TraceFilter: React.FC<TraceFilterProps> = ({  }) => {


    return (
        <div>
            <MessageDropdown />
            <LogLevelsDropdown  />
            <FullTextSearchDropdown />
        </div>
    )

    /*
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
            
        </div>
    );
    */
};

