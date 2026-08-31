"use client";

import { cn } from "@/lib/utils";
import type { AgentStep } from "@/types";

const STEP_LABELS = [
  "Analyzing scene requirements",
  "Searching for real locations",
  "Scouting and ranking locations",
  "Writing scout's report",
  "Gathering imagery",
];

export function AgentTrace({ steps }: { steps: AgentStep[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        <span className="font-mono text-xs uppercase tracking-wide text-foreground-muted">
          Agent activity
        </span>
      </div>
      <div className="space-y-2.5">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1;
          const step = steps.find((s) => s.step === stepNum);
          const status = step?.status ?? "pending";

          return (
            <div key={stepNum} className="flex items-start gap-3 font-mono text-xs">
              <span
                className={cn(
                  "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                  status === "done" && "border-success text-success",
                  status === "running" && "border-foreground-muted animate-pulse",
                  status === "pending" && "border-border"
                )}
              >
                {status === "done" ? "✓" : ""}
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