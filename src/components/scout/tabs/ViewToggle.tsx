"use client";

import { useState, useRef, useEffect } from "react";

export type RightPaneView = "scout" | "suggestions";

interface ViewToggleProps {
    value: RightPaneView;
    onChange: (view: RightPaneView) => void;
}

const OPTIONS: { key: RightPaneView; label: string }[] = [
    { key: "scout", label: "Scout" },
    { key: "suggestions", label: "Suggestions" },
];

/**
 * Small pill-shaped two-option switch, visually inspired by a nav-pill
 * component but with zero routing/mobile-menu baggage — just local state
 * and a sliding highlight that follows the active option.
 */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const scoutRef = useRef<HTMLButtonElement>(null);
    const suggestionsRef = useRef<HTMLButtonElement>(null);
    const [highlightStyle, setHighlightStyle] = useState<{ left: number; width: number }>({
        left: 0,
        width: 0,
    });

    useEffect(() => {
        const activeRef = value === "scout" ? scoutRef.current : suggestionsRef.current;
        const container = containerRef.current;
        if (!activeRef || !container) return;

        const containerRect = container.getBoundingClientRect();
        const activeRect = activeRef.getBoundingClientRect();

        setHighlightStyle({
            left: activeRect.left - containerRect.left,
            width: activeRect.width,
        });
    }, [value]);

    return (
        <div
            ref={containerRef}
            role="tablist"
            aria-label="Right pane view"
            className="relative inline-flex items-center rounded-full bg-neutral-800/60 p-1 backdrop-blur-sm"
        >
            {/* Sliding highlight */}
            <div
                className="absolute top-1 bottom-1 rounded-full bg-white transition-all duration-300 ease-out"
                style={{
                    left: `${highlightStyle.left}px`,
                    width: `${highlightStyle.width}px`,
                }}
                aria-hidden="true"
            />

            {OPTIONS.map((opt) => {
                const isActive = value === opt.key;
                return (
                    <button
                        key={opt.key}
                        ref={opt.key === "scout" ? scoutRef : suggestionsRef}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onChange(opt.key)}
                        className={`relative z-10 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
                            isActive
                                ? "text-black"
                                : "text-neutral-300 hover:text-white"
                        }`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}