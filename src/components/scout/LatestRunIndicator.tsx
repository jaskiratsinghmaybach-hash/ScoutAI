"use client";

import type { ScoutRun } from "@/types";

export function LatestRunIndicator({
    latestRun,
    isViewingLatest,
    onJumpToLatest,
}: {
    latestRun: ScoutRun;
    isViewingLatest: boolean;
    onJumpToLatest: () => void;
}) {
    if (isViewingLatest) return null;

    const isDone = latestRun.packet !== null;
    const totalSteps = 4;
    const doneSteps = latestRun.steps.filter((s) => s.status === "done").length;
    const progressPct = Math.round((doneSteps / totalSteps) * 100);

    if (!isDone) {
        return (
            <div className="px-6 pb-2 pt-1">
                <div className="h-1 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                        className="h-full rounded-full bg-success transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
                <p className="mt-1 text-[10px] text-foreground-muted">
                    Scouting your latest message… {progressPct}%
                </p>
            </div>
        );
    }

    return (
        <div className="px-6 pb-2 pt-1">
            <button
                onClick={onJumpToLatest}
                className="w-full rounded-full border border-success/30 bg-success/10 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20"
            >
                See latest Scout →
            </button>
        </div>
    );
}
