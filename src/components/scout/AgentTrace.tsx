"use client";

import { Check, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentStep, ScoutRun } from "@/types";

// "search" — a fresh scout dispatch from a scene description.
const SEARCH_STEP_LABELS = [
  "Analyzing scene requirements",
  "Searching for real locations",
  "Scouting and ranking locations",
  "Validating site details & accessibility",
  "Writing scout's report",
];

// "refine" — triggered by "find more like this" on a referenced card.
// Deliberately distinct wording so it doesn't misleadingly look like a
// brand-new, from-scratch search.
const REFINE_STEP_LABELS = [
  "Reviewing the referenced location",
  "Searching for similar spots",
  "Ranking new candidates",
  "Validating site details & accessibility",
  "Writing scout's report",
];

export function AgentTrace({
  steps,
  runKind = "search",
  error,
  onRetry,
  isRetrying,
  isDone,
}: {
  steps: AgentStep[];
  runKind?: ScoutRun["runKind"];
  error?: string | null;
  onRetry?: (options?: { forceFresh?: boolean }) => void;
  isRetrying?: boolean;
  isDone?: boolean;
}) {
  const labels = runKind === "refine" ? REFINE_STEP_LABELS : SEARCH_STEP_LABELS;
  const hasError = Boolean(error || steps.some((s) => s.status === "error"));
  const isStuck = !isDone && !hasError && steps.length > 0 && steps.every((s) => s.status !== "running");

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isDone ? (
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
          ) : hasError ? (
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          ) : isStuck ? (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          )}
          <span className="font-mono text-xs uppercase tracking-wide text-foreground-muted">
            {isDone
              ? "Agent activity • Complete"
              : hasError
              ? "Agent activity • Paused on error"
              : isStuck
              ? "Agent activity • Paused"
              : "Agent activity"}
          </span>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={() => onRetry({ forceFresh: isDone })}
            disabled={isRetrying}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium transition active:scale-95 disabled:opacity-50",
              hasError || isStuck
                ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40 hover:bg-rose-500/30"
                : "bg-neutral-800 text-neutral-300 ring-1 ring-white/10 hover:bg-neutral-700 hover:text-white"
            )}
          >
            <RotateCcw className={cn("h-3 w-3", isRetrying && "animate-spin")} />
            <span>{isRetrying ? "Resuming..." : hasError || isStuck ? "Resume" : "Re-scout"}</span>
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {labels.map((label, i) => {
          const stepNum = i + 1;
          const step = steps.find((s) => s.step === stepNum);
          const status = step?.status ?? "pending";
          const isCurrentStepRunning = status === "running" || (isRetrying && !step && i === steps.length);

          return (
            <div key={stepNum} className="flex items-start gap-3 font-mono text-xs">
              <span
                className={cn(
                  "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  status === "done" && "border-success bg-success/15",
                  isCurrentStepRunning && "border-foreground-muted animate-pulse",
                  status === "error" && "border-rose-500 bg-rose-500/20 text-rose-400",
                  status === "pending" && "border-border"
                )}
              >
                {status === "done" && (
                  <Check className="h-2.5 w-2.5 text-success" strokeWidth={3} />
                )}
                {status === "error" && (
                  <AlertCircle className="h-2.5 w-2.5 text-rose-400" strokeWidth={3} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    status === "pending"
                      ? "text-foreground-muted"
                      : status === "error"
                      ? "text-rose-300 font-medium"
                      : "text-foreground font-medium"
                  )}
                >
                  {label}
                </div>
                {step?.detail && (
                  <div
                    className={cn(
                      "mt-0.5 break-words text-[11px] leading-relaxed",
                      status === "error" ? "text-rose-400/90" : "text-foreground-muted"
                    )}
                  >
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action footer for stuck/error runs */}
      {(hasError || isStuck || error) && (
        <div className="mt-4 rounded-md border border-rose-500/20 bg-rose-950/20 p-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div className="min-w-0 flex-1 space-y-1.5 text-xs">
              <div className="font-medium text-rose-200">
                {error || "Pipeline paused before completion"}
              </div>
              <div className="text-[11px] text-rose-300/80">
                Resume will verify data from the previous step and continue, or you can re-run fresh from scratch.
              </div>
              {onRetry && (
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRetry({ forceFresh: false })}
                    disabled={isRetrying}
                    className="inline-flex items-center gap-2 rounded-md bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200 ring-1 ring-rose-500/40 transition hover:bg-rose-500/30 hover:text-white active:scale-95 disabled:opacity-50"
                  >
                    <RotateCcw className={cn("h-3.5 w-3.5", isRetrying && "animate-spin")} />
                    <span>{isRetrying ? "Resuming..." : "Resume & verify previous step"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRetry({ forceFresh: true })}
                    disabled={isRetrying}
                    className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800/80 px-2.5 py-1.5 text-xs font-medium text-neutral-300 ring-1 ring-white/10 transition hover:bg-neutral-800 hover:text-white active:scale-95 disabled:opacity-50"
                  >
                    <RotateCcw className={cn("h-3 w-3", isRetrying && "animate-spin")} />
                    <span>Re-scout from scratch</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action footer for completed runs */}
      {isDone && onRetry && (
        <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-3">
          <span className="text-[11px] text-foreground-muted">All 5 stages completed</span>
          <button
            type="button"
            onClick={() => onRetry({ forceFresh: true })}
            disabled={isRetrying}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800/80 px-3 py-1.5 text-xs font-medium text-neutral-300 ring-1 ring-white/10 transition hover:bg-neutral-800 hover:text-white active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className={cn("h-3.5 w-3.5", isRetrying && "animate-spin")} />
            <span>{isRetrying ? "Re-scouting..." : "Re-scout from scratch"}</span>
          </button>
        </div>
      )}
    </div>
  );
}