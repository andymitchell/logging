import React, { useEffect, useState } from "react";

interface DelayedInputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
    value: string;
    onChange: (value: string) => void;
    delay?: number;
}

const DelayedInput: React.FC<DelayedInputProps> = ({
    value,
    onChange,
    delay = 500,
    ...props
}) => {
    const [internalValue, setInternalValue] = useState<string>(value);

    // Sync internal value with external value when it changes
    useEffect(() => {
        setInternalValue(value);
    }, [value]);

    // Debounce notifying parent
    useEffect(() => {
        const handler = setTimeout(() => {
            if (internalValue !== value) {
                onChange(internalValue);
            }
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [internalValue, delay, onChange, value]);

    return (
        <input
            {...props}
            value={internalValue}
            onChange={(e) => setInternalValue(e.target.value)}
        />
    );
};

export default DelayedInput;
