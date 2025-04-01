
import { useState, useRef, useEffect, type ReactNode } from "react";

type DropdownProps = {
    label: string;
    children: ReactNode;
};

const Dropdown: React.FC<DropdownProps> = ({ label, children }) => {

    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        }

        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [open]);

    return (
        <div
            ref={containerRef}
            style={{ position: "relative", display: "inline-block" }}
        >
            <button
                onClick={() => setOpen(!open)}
                style={{
                    padding: "6px 12px",
                    background: "#eee",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    cursor: "pointer",
                }}
            >
                {label}
            </button>

        
            <div
                style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: "4px",
                    width: "200px",
                    background: "#fff",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                    padding: "8px",
                    zIndex: 1000,
                    display: open? 'block' : 'none'
                }}
            >
                {children}
            </div>
            
        </div>
    );
}

export default Dropdown;