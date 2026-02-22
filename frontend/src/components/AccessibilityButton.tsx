import React, { useEffect, useRef } from 'react';
import { Accessibility } from 'lucide-react';

interface AccessibilityButtonProps {
    isModalOpen: boolean;
    onToggle: () => void;
}

const AccessibilityButton: React.FC<AccessibilityButtonProps> = ({
    isModalOpen,
    onToggle,
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Global keyboard shortcut: Alt + A
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                onToggle();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onToggle]);

    return (
        <button
            ref={buttonRef}
            onClick={onToggle}
            aria-haspopup="dialog"
            aria-expanded={isModalOpen}
            aria-label="Open Accessibility Assistant (Alt + A)"
            title="Accessibility Assistant (Alt + A)"
            className="a11y-fab"
        >
            <Accessibility size={26} aria-hidden="true" />
            {/* Screen-reader label */}
            <span className="a11y-sr-only">Accessibility</span>

            {/* Pulse ring when modal is open */}
            {isModalOpen && <span className="a11y-fab-ring" aria-hidden="true" />}
        </button>
    );
};

export default AccessibilityButton;
