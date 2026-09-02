"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { RunHistoryDropdown } from "./RunHistoryDropdown";
import { AgentActivityMiniPill } from "./AgentActivityMiniPill";
import { AgentActivityFocused } from "./AgentActivityFocused";
import { LocationResultCard } from "./LocationResultCard";
import { RightPanelIdle } from "./RightPanelIdle";
import { CardSuggestions } from "./CardSuggestions";
import type { ScoutRun, Location } from "@/types";

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
 *   the full blurred-behind AgentTrace view.
 * - selectedRunId: which completed run's cards are currently shown.
 *
 * All of this state lives in ScoutApp — this component is
 * presentational plus local UI toggles only.
 *
 * NEW: "Add to chat" + its Suggestions dropdown live in this header
 * row, next to the dismiss (X) button — matches the product's
 * wireframe placement. They act on `selectedLocation`, which
 * LocationResultCard reports up via onSelectedLocationChange (it's
 * the only component that knows which of the pill-navigated locations
 * is currently active). onAttachCard/onAttachSuggestion bubble further
 * up to ScoutApp, which owns the actual attached-card state that
 * drives the message box.
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
  onAttachCard,
  onAttachSuggestion,
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
  onAttachCard: (location: Location) => void;
  onAttachSuggestion: (location: Location, suggestionText: string) => void;
}) {
  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;
  const focusedRun = runs.find((r) => r.id === focusedRunId) ?? null;
  const isFocused = Boolean(focusedRun);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* Top controls */}
      <div className="mb-4 flex items-center justify-between gap-3">
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

        {selectedRun?.packet && selectedLocation && (
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex flex-col items-end gap-0.5">
              <button
                type="button"
                onClick={() => onAttachCard(selectedLocation)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full bg-neutral-800/60 px-3 py-1.5 text-xs font-medium text-neutral-300 backdrop-blur-sm transition-colors hover:bg-neutral-800 hover:text-white",
                )}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Add to chat
              </button>
              <CardSuggestions
                location={selectedLocation}
                onPick={(text) => onAttachSuggestion(selectedLocation, text)}
              />
            </div>

            <button
              type="button"
              onClick={onDismissCards}
              className="flex h-7 w-7 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-neutral-800 hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {selectedRun && !selectedLocation && (
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
            <LocationResultCard
              packet={selectedRun.packet}
              onSelectedLocationChange={setSelectedLocation}
            />
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