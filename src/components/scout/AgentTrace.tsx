"use client";

import { cn } from "@/lib/utils";
import type { AgentStep } from "@/types";

const STEP_LABELS = [
  "Analyzing scene requirements",
  "Searching for real locations",
  "Scouting and ranking locations",
  "Writing scout's report",
];

export function AgentTrace({ steps }: { steps: AgentStep[] }) {
  return (
    <div className="border border-neutral-800 bg-neutral-950/60 p-6 font-mono text-sm">
      <div className="mb-4 text-xs uppercase tracking-widest text-neutral-500">
        Agent Trace
      </div>
      <div className="space-y-3">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1;
          const step = steps.find((s) => s.step === stepNum);
          const status = step?.status ?? "pending";

          return (
            <div key={stepNum} className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 rounded-full border flex items-center justify-center",
                  status === "done" && "border-emerald-400 bg-emerald-400/20",
                  status === "running" && "border-amber-400 bg-amber-400/20 animate-pulse",
                  status === "pending" && "border-neutral-700"
                )}
              >
                {status === "done" && (
                  <span className="text-[9px] text-emerald-400">✓</span>
                )}
              </div>
              <div className="flex-1">
                <div
                  className={cn(
                    "text-xs",
                    status === "pending" ? "text-neutral-600" : "text-neutral-200"
                  )}
                >
                  {label}
                </div>
                {step?.detail && (
                  <div className="mt-0.5 text-[11px] text-neutral-500">
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
