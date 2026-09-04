"use client";

import { Check } from "lucide-react";
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
}: {
  steps: AgentStep[];
  runKind?: ScoutRun["runKind"];
}) {
  const labels = runKind === "refine" ? REFINE_STEP_LABELS : SEARCH_STEP_LABELS;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        <span className="font-mono text-xs uppercase tracking-wide text-foreground-muted">
          Agent activity
        </span>
      </div>
      <div className="space-y-2.5">
        {labels.map((label, i) => {
          const stepNum = i + 1;
          const step = steps.find((s) => s.step === stepNum);
          const status = step?.status ?? "pending";

          return (
            <div key={stepNum} className="flex items-start gap-3 font-mono text-xs">
              <span
                className={cn(
                  "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                  status === "done" && "border-success bg-success/15",
                  status === "running" && "border-foreground-muted animate-pulse",
                  status === "pending" && "border-border"
                )}
              >
                {status === "done" && (
                  <Check className="h-2.5 w-2.5 text-success" strokeWidth={3} />
                )}
              </span>
              <div>
                <div className={status === "pending" ? "text-foreground-muted" : "text-foreground"}>
                  {label}
                </div>
                {step?.detail && (
                  <div className="mt-0.5 text-foreground-muted">{step.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}