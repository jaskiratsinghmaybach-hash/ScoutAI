"use client";

import { CheckCircle2 } from "lucide-react";
import type { ScoutRun } from "@/types";

export function ActivityPill({
    run,
    isActive,
    onClick,
}: {
    run: ScoutRun;
    isActive: boolean;
    onClick: () => void;
}) {
    const isDone = run.packet !== null;
    const locationCount = run.packet?.locations.length ?? 0;

    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 rounded-[30px] border px-3 py-1.5 text-xs transition-colors ${isActive
                    ? "border-foreground/40 bg-surface-raised text-foreground"
                    : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
                }`}
        >
            {isDone ? (
                <CheckCircle2 className="h-3 w-3 text-success" />
            ) : (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            )}
            <span>
                {isDone ? `Scouted ${locationCount} locations` : "Agent activity"}
            </span>
        </button>
    );
}