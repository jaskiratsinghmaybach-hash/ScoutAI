"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RunHistoryDropdown } from "./RunHistoryDropdown";
import { AgentActivityMiniPill } from "./AgentActivityMiniPill";
import { AgentActivityFocused } from "./AgentActivityFocused";
import { LocationResultCard } from "./LocationResultCard";
import { RightPanelIdle } from "./RightPanelIdle";
import type { ScoutRun } from "@/types";

/**
 * Right-panel state machine (see conversation notes for the full spec
 * this implements):
 *
 * - inFlightRun: the run currently tracked by the mini pill — set the
 *   moment a run starts, cleared the moment its cards are opened for
 *   the first time (not when the run merely completes). While set and
 *   not yet done, the mini pill ticks steps live. Once done, it turns
 *   green and stays clickable until opened.
 * - focusedRunId: non-null while the user has the pill expanded into
 *   the full blurred-behind AgentTrace view. Independent of
 *   inFlightRun's done/not-done status — the user can re-open the
 *   focused view to watch a still-running trace, or to peek at a just-
 *   finished one before clicking through to its cards.
 * - selectedRunId: which completed run's cards are currently shown.
 *   Null means idle. Set by the dropdown, by the in-chat ActivityPill
 *   (via the same onSelectRun prop, wired in ScoutApp), or by opening
 *   the mini pill's cards once its run is done.
 *
 * All of this state actually lives in ScoutApp (single source of
 * truth for runs/activeRunId already exists there) — this component
 * is intentionally presentational plus local UI toggles only
 * (dropdown open/closed lives inside RunHistoryDropdown itself).
 */
export function ResultsPanel({
  runs,
  inFlightRun,
  focusedRunId,
  selectedRunId,
  onOpenFocused,
  onCloseFocused,
  onSelectRun,
  onOpenMiniPillCards,
  onDismissCards,
}: {
  runs: ScoutRun[];
  inFlightRun: ScoutRun | null;
  focusedRunId: string | null;
  selectedRunId: string | null;
  onOpenFocused: (runId: string) => void;
  onCloseFocused: () => void;
  onSelectRun: (runId: string) => void;
  onOpenMiniPillCards: (runId: string) => void;
  onDismissCards: () => void;
}) {
  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;
  const focusedRun = runs.find((r) => r.id === focusedRunId) ?? null;
  const isFocused = Boolean(focusedRun);

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* Top controls */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RunHistoryDropdown
            runs={runs}
            activeRunId={selectedRunId}
            onSelect={onSelectRun}
          />
          <AnimatePresence>
            {inFlightRun && (
              <AgentActivityMiniPill
                key={inFlightRun.id}
                run={inFlightRun}
                onClick={() =>
                  inFlightRun.packet
                    ? onOpenMiniPillCards(inFlightRun.id)
                    : onOpenFocused(inFlightRun.id)
                }
              />
            )}
          </AnimatePresence>
        </div>

        {selectedRun && (
          <button
            type="button"
            onClick={onDismissCards}
            className="flex h-7 w-7 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-neutral-800 hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Main content area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "h-full w-full transition-[filter] duration-300",
            isFocused && "pointer-events-none blur-sm",
          )}
        >
          {selectedRun?.packet ? (
            <LocationResultCard packet={selectedRun.packet} />
          ) : (
            <RightPanelIdle />
          )}
        </div>

        <AnimatePresence>
          {focusedRun && (
            <AgentActivityFocused run={focusedRun} />
          )}
        </AnimatePresence>

        {/* Click-through backdrop to collapse focused view back to mini pill,
            without discarding the run — same spot, minimized again. */}
        {isFocused && (
          <button
            type="button"
            onClick={onCloseFocused}
            className="absolute inset-0 z-10 cursor-default"
            aria-label="Minimize agent activity"
            tabIndex={-1}
          />
        )}
      </div>
    </div>
  );
}