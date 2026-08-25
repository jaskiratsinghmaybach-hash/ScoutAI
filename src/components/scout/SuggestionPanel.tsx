"use client";

import { useState, useEffect } from "react";
import { getRandomSuggestions } from "@/data/suggestions";

export function SuggestionPanel({ onSelect }: { onSelect: (text: string) => void }) {
    const [suggestions, setSuggestions] = useState<string[]>([]);

    useEffect(() => {
        setSuggestions(getRandomSuggestions(3));
    }, []);

    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
            <p className="text-sm text-neutral-400">Need inspiration? Try one of these:</p>
            <div className="flex w-full max-w-md flex-col gap-2.5">
                {suggestions.map((s) => (
                    <button
                        key={s}
                        onClick={() => onSelect(s)}
                        className="group w-full rounded-full bg-neutral-800/60 px-5 py-3.5 text-left text-sm text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:text-white active:scale-95"
                    >
                        {s}
                    </button>
                ))}
            </div>
        </div>
    );
}