"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Location } from "@/types";

/**
 * Row of 2-3 broad suggestion chips above the message box, shown only
 * while cards are currently on screen (parent controls that
 * condition). Scoped to ALL locations in the current packet together —
 * comparative/broad questions, not about any single card (that's
 * CardSuggestions). Picking one calls onPick, same contract as
 * CardSuggestions: parent fills the message box and attaches the
 * (all-scope) card reference.
 */
export function BroadSuggestions({
  locations,
  onPick,
}: {
  locations: Location[];
  onPick: (text: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Key by the set of location ids so suggestions refresh when the
  // underlying card set actually changes (a new run replacing the
  // old 4), not on every unrelated re-render.
  const locationsKey = locations.map((l) => l.id).join(",");

  // Store the key alongside state so we can reset `dismissed` instantly
  // during render when `locationsKey` changes without causing cascading effect renders.
  const [dismissedState, setDismissedState] = useState<{
    key: string;
    set: Set<number>;
  }>({
    key: locationsKey,
    set: new Set(),
  });

  const dismissed =
    dismissedState.key === locationsKey
      ? dismissedState.set
      : new Set<number>();

  const requestIdRef = useRef(0);

  useEffect(() => {
    if (locations.length === 0) {
      // Nothing to fetch — `visible` below already renders nothing
      // when `locations` is empty, so there's no state to reset here.
      return;
    }
    const requestId = ++requestIdRef.current;
    fetch("/api/broad-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations }),
    })
      .then((res) => res.json())
      .then((data: { suggestions?: string[] }) => {
        if (requestIdRef.current !== requestId) return; // stale
        setSuggestions(data.suggestions ?? []);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setSuggestions([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationsKey]);

  const visible =
    locations.length === 0
      ? []
      : suggestions.map((s, i) => ({ s, i })).filter(({ i }) => !dismissed.has(i));

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-1">
      {visible.map(({ s, i }) => (
        <div
          key={i}
          // Translucent + blurred rather than the previous near-solid
          // bg-neutral-800/60 — these chips sit right on top of the
          // message thread, and that background was opaque enough to
          // hide the messages behind it instead of just tinting them.
          className="group inline-flex items-center gap-1.5 rounded-full bg-neutral-800/30 pl-3 pr-1.5 py-1.5 text-xs font-medium text-neutral-300 backdrop-blur-md ring-1 ring-white/5 transition-colors hover:bg-neutral-800/50"
        >
          <button type="button" onClick={() => onPick(s)} className="hover:text-white">
            {s}
          </button>
          <button
            type="button"
            onClick={() =>
              setDismissedState((prev) => {
                const currentSet =
                  prev.key === locationsKey ? prev.set : new Set<number>();
                const updated = new Set(currentSet);
                updated.add(i);
                return { key: locationsKey, set: updated };
              })
            }
            aria-label="Dismiss suggestion"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}