"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocationStats } from "./LocationStats";
import { SceneTab } from "./tabs/SceneTab";
import { ShootTab } from "./tabs/ShootTab";
import { AccessTab } from "./tabs/AccessTab";
import { SourcesTab } from "./tabs/SourcesTab";
import type { Location, ScoutingPacket } from "@/types";

const TABS = ["Scene", "Shoot", "Access", "Sources"] as const;
type TabKey = (typeof TABS)[number];

function TabContent({ tab, location }: { tab: TabKey; location: Location }) {
  switch (tab) {
    case "Scene":
      return <SceneTab location={location} />;
    case "Shoot":
      return <ShootTab location={location} />;
    case "Access":
      return <AccessTab location={location} />;
    case "Sources":
      return <SourcesTab location={location} />;
  }
}

/**
 * The full payoff-moment card. Renders one selected location from the
 * packet at a time; the pill row swaps which location is selected
 * without unmounting the outer card, so tab selection persists across
 * pill switches.
 *
 * Locations are re-sorted by score descending here as a safety net —
 * the pipeline is expected to already return them sorted, but nothing
 * downstream should assume that silently.
 *
 * Pill count is NOT assumed to be 4: agent.ts verifies each location
 * is a real, findable place before it ever reaches the client, and
 * drops any that can't be confirmed — so packet.locations can
 * legitimately be 1-4 long. The pill grid sizes itself to however
 * many actually survived, and packet.narrowing_note is shown above
 * the pills when the count dropped.
 *
 * Reports the currently-selected location up via onSelectedLocationChange
 * so ResultsPanel (which renders the "Add to chat" control in its
 * header, alongside the dismiss button) always knows which specific
 * card the user is looking at — that's the location "Add to chat"
 * attaches when clicked for a single-card reference.
 */
export function LocationResultCard({
  packet,
  onSelectedLocationChange,
}: {
  packet: ScoutingPacket;
  onSelectedLocationChange?: (location: Location | null) => void;
}) {
  const sortedLocations = [...packet.locations].sort(
    (a, b) => b.score - a.score,
  );
  const [selectedId, setSelectedId] = useState(sortedLocations[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<TabKey>("Scene");
  // Lets the user hide the "fewer than 4 results" note themselves.
  // Keyed by the note's own text rather than a plain boolean so that
  // switching to a *different* run/search still shows its own note
  // even if this one was dismissed — only re-showing the exact same
  // note (e.g. flipping between cards within the same packet) stays
  // hidden once dismissed.
  const [dismissedNote, setDismissedNote] = useState<string | null>(null);

  const location =
    sortedLocations.find((l) => l.id === selectedId) ?? sortedLocations[0];

  useEffect(() => {
    onSelectedLocationChange?.(location ?? null);
    // Only re-report when the selected location itself changes, not
    // on every render — onSelectedLocationChange is expected to be a
    // stable callback (useCallback/inline setState setter) from the
    // caller, so it's deliberately excluded from deps here to avoid
    // re-running this on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.id]);

  if (!location) {
    // All candidates failed verification — narrowing_note (set by
    // agent.ts in this exact case) carries the explanation.
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 px-8 text-center">
        <AlertCircle className="h-6 w-6 text-foreground-muted" />
        <p className="max-w-sm text-sm text-foreground-muted">
          {packet.narrowing_note ??
            "No locations could be confirmed as real, findable places for this search."}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex h-full min-h-0 w-full min-w-0 flex-col gap-5 overflow-hidden"
    >
      {/* Top area: location name + country */}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.id}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.2 }}
        >
          <h2 className="text-xl font-semibold text-foreground">
            {location.name}
          </h2>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {location.country}
          </p>
        </motion.div>
      </AnimatePresence>

      <div className="flex min-h-0 flex-1 gap-5">
        {/* Main pane: tabs + content */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div
            role="tablist"
            aria-label="Location detail"
            className="flex shrink-0 items-center gap-1 rounded-full bg-neutral-800/60 p-1 backdrop-blur-sm"
          >
            {TABS.map((tab) => {
              const isActive = tab === activeTab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200",
                    isActive
                      ? "bg-white text-black"
                      : "text-neutral-300 hover:text-white",
                  )}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${location.id}-${activeTab}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <TabContent tab={activeTab} location={location} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Right-side stats column */}
        <div className="scrollbar-thin w-40 shrink-0 overflow-y-auto sm:w-44 lg:w-48">
          <LocationStats location={location} />
        </div>
      </div>

      {packet.narrowing_note && packet.narrowing_note !== dismissedNote && (
        <div className="flex shrink-0 items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground-muted">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{packet.narrowing_note}</span>
          <button
            type="button"
            onClick={() => setDismissedNote(packet.narrowing_note ?? null)}
            aria-label="Dismiss note"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-neutral-800/60 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Location pill navigator — sized to however many locations
          actually survived verification (1-4), never assumed to be 4 */}
      <div
        className="grid shrink-0 gap-2"
        style={{ gridTemplateColumns: `repeat(${sortedLocations.length}, minmax(0, 1fr))` }}
      >
        {sortedLocations.map((loc, i) => {
          const isActive = loc.id === location.id;
          return (
            <button
              key={loc.id}
              type="button"
              onClick={() => setSelectedId(loc.id)}
              className={cn(
                "min-w-0 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all duration-200",
                isActive
                  ? "border-white/40 bg-neutral-800 text-white"
                  : "border-border bg-surface text-foreground-muted hover:text-foreground",
              )}
            >
              <div className="truncate">{loc.name}</div>
              <div className="mt-0.5 truncate text-[10px] text-foreground-muted">
                #{i + 1} · {loc.score}/100
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}