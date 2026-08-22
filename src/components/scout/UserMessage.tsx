"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function UserMessage({ content }: { content: string }) {
    const [expanded, setExpanded] = useState(false);
    const lines = content.split("\n");
    const isLong = content.length > 140 || lines.length > 3;

    return (
        <div className="ml-auto w-fit max-w-[85%] rounded-3xl bg-surface-raised px-3 py-2 text-sm">
            <p className={expanded ? "" : "line-clamp-3"}>{content}</p>
            {isLong && (
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-1 flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground"
                >
                    {expanded ? (
                        <>
                            Show less <ChevronUp className="h-3 w-3" />
                        </>
                    ) : (
                        <>
                            Show more <ChevronDown className="h-3 w-3" />
                        </>
                    )}
                </button>
            )}
        </div>
    );
}