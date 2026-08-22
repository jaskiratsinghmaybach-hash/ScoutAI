"use client";

import { useMemo } from "react";
import { getRandomSuggestions } from "@/data/suggestions";

export function SuggestionPanel({ onSelect }: { onSelect: (text: string) => void }) {
    const suggestions = useMemo(() => getRandomSuggestions(3), []);

    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
            <p className="text-sm text-foreground-muted">Need inspiration? Try one of these:</p>
            <div className="flex w-full max-w-md flex-col gap-2">
                {suggestions.map((s) => (
                    <button
                        key={s}
                        onClick={() => onSelect(s)}
                        className="rounded-lg border border-border bg-surface px-4 py-3 text-left text-sm text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
                    >
                        {s}
                    </button>
                ))}
            </div>
        </div>
    );
}