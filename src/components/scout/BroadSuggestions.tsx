"use client";

import { useState, useEffect, useRef } from "react";
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
  const requestIdRef = useRef(0);
  // Key by the set of location ids so suggestions refresh when the
  // underlying card set actually changes (a new run replacing the
  // old 4), not on every unrelated re-render.
  const locationsKey = locations.map((l) => l.id).join(",");

  useEffect(() => {
    if (locations.length === 0) {
      setSuggestions([]);
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

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-1">
      {suggestions.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(s)}
          className="rounded-full bg-neutral-800/60 px-3 py-1.5 text-xs font-medium text-neutral-300 backdrop-blur-sm transition-colors hover:bg-neutral-800 hover:text-white"
        >
          {s}
        </button>
      ))}
    </div>
  );
}