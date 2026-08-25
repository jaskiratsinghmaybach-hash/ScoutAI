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
            type="button"
            onClick={onClick}
            className={`group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-all duration-200 active:scale-95 ${isActive
                    ? "bg-neutral-800 text-white shadow-sm ring-1 ring-white/20"
                    : "bg-neutral-800/60 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                }`}
        >
            {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            )}
            <span>
                {isDone ? `Scouted ${locationCount} locations` : "Agent activity"}
            </span>
        </button>
    );
}