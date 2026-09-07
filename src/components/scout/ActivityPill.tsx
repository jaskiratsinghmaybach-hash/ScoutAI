"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
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
    const hasError = Boolean(run.error || run.status === "error" || run.steps.some((s) => s.status === "error"));

    return (
        <button
            type="button"
            onClick={onClick}
            title={
                hasError
                    ? "Scout run encountered an issue — click to view and retry"
                    : isDone
                    ? "Click to view scouted locations"
                    : "Click to view agent activity"
            }
            className={`group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-all duration-200 active:scale-95 ${
                hasError
                    ? "bg-rose-950/60 text-rose-300 ring-1 ring-rose-500/40 hover:bg-rose-900/80 hover:text-white"
                    : isActive
                    ? "bg-neutral-800 text-white shadow-sm ring-1 ring-white/20"
                    : "bg-neutral-800/60 text-neutral-300 hover:bg-neutral-800 hover:text-white"
            }`}
        >
            {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : hasError ? (
                <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
            ) : (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            )}
            <span>
                {isDone
                    ? `Scouted ${locationCount} locations`
                    : hasError
                    ? "Agent activity (paused — retry)"
                    : "Agent activity"}
            </span>
        </button>
    );
}