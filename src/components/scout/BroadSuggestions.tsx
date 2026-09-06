"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import type { Location } from "@/types";

/**
 * Collapsible row of broad suggestion chips above the message box,
 * shown only while cards are on screen. Kept collapsed by default behind
 * a sleek suggestions button with an arrow, so it doesn't clutter the
 * important chat composer space until the user asks for suggestions.
 */
export function BroadSuggestions({
  locations,
  onPick,
}: {
  locations: Location[];
  onPick: (text: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Key by the set of location ids so suggestions refresh when the
  // underlying card set actually changes
  const locationsKey = locations.map((l) => l.id).join(",");

  // Store the key alongside state so we can reset `dismissed` instantly
  // during render when `locationsKey` changes
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
  }, [locationsKey, locations]);

  const visible =
    locations.length === 0
      ? []
      : suggestions.map((s, i) => ({ s, i })).filter(({ i }) => !dismissed.has(i));

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col items-start gap-1.5 px-1">
      {/* Sleek toggle button with suggestions icon and arrow indicator */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="group inline-flex items-center gap-1.5 rounded-full bg-neutral-900/80 hover:bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:text-white ring-1 ring-white/10 transition-all active:scale-95 shadow-sm"
        title={isOpen ? "Hide suggestions" : "Show suggested questions"}
      >
        <Sparkles className="h-3.5 w-3.5 text-amber-400 group-hover:rotate-12 transition-transform duration-200" />
        <span>Suggestions</span>
        <span className="text-[10px] text-neutral-400">({visible.length})</span>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-neutral-400 group-hover:text-white" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-neutral-400 group-hover:text-white" />
        )}
      </button>

      {/* Suggestion chips (only revealed when toggled open) */}
      {isOpen && (
        <div className="flex flex-wrap gap-2 pt-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
          {visible.map(({ s, i }) => (
            <div
              key={i}
              className="group inline-flex items-center gap-1.5 rounded-full bg-neutral-950/80 pl-3 pr-1.5 py-1.5 text-xs font-medium text-neutral-200 backdrop-blur-xl ring-1 ring-white/12 transition-colors hover:bg-neutral-900 hover:text-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => {
                  onPick(s);
                  setIsOpen(false);
                }}
                className="hover:text-white text-left"
              >
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
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}