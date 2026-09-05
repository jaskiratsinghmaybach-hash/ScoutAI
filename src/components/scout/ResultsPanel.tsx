"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { X, MessageSquarePlus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { RunHistoryDropdown } from "./RunHistoryDropdown";
import { AgentActivityMiniPill } from "./AgentActivityMiniPill";
import { AgentActivityFocused } from "./AgentActivityFocused";
import { AgentTrace } from "./AgentTrace";
import { LocationResultCard } from "./LocationResultCard";
import { RightPanelIdle } from "./RightPanelIdle";
import { OnboardingFlow } from "./OnboardingFlow";
import { CardSuggestions } from "./CardSuggestions";
import { prefetchCardSuggestions } from "@/lib/cardSuggestionsCache";
import type { ScoutRun, Location } from "@/types";
import type { SyncStatus } from "@/lib/useAuth";

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
  user,
  syncStatus,
  onOpenContinuity,
  onQuickStart,
  hasOnboarded,
  onboardingPrefillName,
  onCompleteOnboarding,
  displayName,
  onRetryRun,
  isRetryingRunId,
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
  user: User | null;
  syncStatus: SyncStatus;
  onOpenContinuity: () => void;
  onQuickStart: (text: string) => void;
  hasOnboarded: boolean;
  onboardingPrefillName?: string | null;
  onCompleteOnboarding: (name: string) => void;
  displayName?: string | null;
  onRetryRun?: (runId: string, options?: { forceFresh?: boolean }) => void;
  isRetryingRunId?: string | null;
}) {
  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;
  const focusedRun = runs.find((r) => r.id === focusedRunId) ?? null;
  const isFocused = Boolean(focusedRun);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  // Kick off background generation of every card's "Suggestions"
  // dropdown content as soon as a result packet is shown — not
  // per-card on click. By the time the user flips from e.g. House Of
  // The Palms to Greystone Mansion, its suggestions are already
  // sitting in the cache (see cardSuggestionsCache.ts) instead of
  // needing a fresh Gemini round-trip. Runs once per distinct set of
  // locations (keyed by their ids) rather than on every render.
  const packetLocations = selectedRun?.packet?.locations;
  const packetLocationsKey = packetLocations?.map((l) => l.id).join(",") ?? "";
  useEffect(() => {
    if (packetLocations && packetLocations.length > 0) {
      prefetchCardSuggestions(packetLocations);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packetLocationsKey]);

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
            {/* Suggestions sits to the LEFT of "Add to chat", same row —
                previously stacked underneath it in a flex-col wrapper. */}
            <div className="flex items-center gap-3">
              <CardSuggestions
                key={selectedLocation.id}
                location={selectedLocation}
                onPick={(text) => onAttachSuggestion(selectedLocation, text)}
              />
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
          ) : selectedRun ? (
            <div className="flex h-full w-full items-center justify-center p-8 overflow-y-auto">
              <div className="w-full max-w-md">
                <AgentTrace
                  steps={selectedRun.steps}
                  runKind={selectedRun.runKind}
                  error={selectedRun.error}
                  onRetry={(opts) => onRetryRun?.(selectedRun.id, opts)}
                  isRetrying={isRetryingRunId === selectedRun.id}
                  isDone={Boolean(selectedRun.packet)}
                />
              </div>
            </div>
          ) : !hasOnboarded ? (
            <OnboardingFlow
              prefillName={onboardingPrefillName}
              onComplete={onCompleteOnboarding}
            />
          ) : (
            <RightPanelIdle
              user={user}
              syncStatus={syncStatus}
              onOpenContinuity={onOpenContinuity}
              onQuickStart={onQuickStart}
              displayName={displayName}
            />
          )}
        </div>

        <AnimatePresence>
          {focusedRun && (
            <AgentActivityFocused
              run={focusedRun}
              onClose={onCloseFocused}
              onRetry={(opts) => onRetryRun?.(focusedRun.id, opts)}
              isRetrying={isRetryingRunId === focusedRun.id}
            />
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