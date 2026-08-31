"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScoutRun } from "@/types";

/**
 * Top-left control on the right panel. Lists every run that has a
 * completed packet (in-flight runs aren't listed here — that's what
 * the mini pill next to this dropdown is for). Selecting an entry
 * hands its id back to the parent, which is responsible for actually
 * switching the panel into the cards view.
 */
export function RunHistoryDropdown({
  runs,
  activeRunId,
  onSelect,
}: {
  runs: ScoutRun[];
  activeRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const completedRuns = runs.filter((r) => r.packet);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (completedRuns.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800/60 px-3 py-1.5 text-xs font-medium text-neutral-300 backdrop-blur-sm transition-colors duration-200 hover:bg-neutral-800 hover:text-white"
      >
        <span>Past searches</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="scrollbar-thin absolute left-0 top-full z-30 mt-2 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {completedRuns
            .slice()
            .reverse()
            .map((run) => {
              const count = run.packet?.locations.length ?? 0;
              const isActive = run.id === activeRunId;
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => {
                    onSelect(run.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors duration-150",
                    isActive
                      ? "bg-neutral-800 text-white"
                      : "text-foreground-muted hover:bg-neutral-800/60 hover:text-foreground",
                  )}
                >
                  <span className="truncate">
                    {run.triggerMessageContent || "Untitled search"}
                  </span>
                  <span className="ml-2 shrink-0 text-xs text-foreground-muted">
                    {count} spot{count === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}