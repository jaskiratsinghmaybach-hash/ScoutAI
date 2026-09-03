"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Location } from "@/types";

/**
 * Dropdown of 2-3 pinpoint suggested questions for ONE specific
 * location (fetched from /api/card-suggestions). Lives directly under
 * "Add to chat" in the card UI. Picking a suggestion calls onPick,
 * which the parent uses to both fill the message box with that text
 * AND attach this location — same as clicking Add to Chat manually,
 * just pre-filled.
 *
 * The parent renders this with `key={location.id}`, so switching to a
 * different location remounts the component and resets `open` /
 * `suggestions` for free — no reset effect needed here.
 */
export function CardSuggestions({
  location,
  onPick,
}: {
  location: Location;
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleToggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && suggestions === null && !loading) {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const res = await fetch("/api/card-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ location }),
        });
        const data = (await res.json()) as { suggestions?: string[] };
        if (requestIdRef.current !== requestId) return; // stale — user moved on
        setSuggestions(data.suggestions ?? []);
      } catch {
        if (requestIdRef.current !== requestId) return;
        setSuggestions([]);
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-muted transition-colors hover:text-foreground"
      >
        Suggestions
        <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        // Anchored to the right edge and clamped to the viewport width
        // (minus a small margin) rather than a fixed w-64 — this panel
        // sits near the right edge of the results panel, and a
        // left-aligned fixed width was running off-screen there.
        // max-h + overflow-y-auto keeps a long suggestion list (or a
        // future increase in count) scrollable within the viewport
        // instead of extending past it.
        <div className="absolute right-0 top-full z-30 mt-1.5 w-64 max-w-[calc(100vw-2rem)] max-h-[min(20rem,calc(100vh-6rem))] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <span className="text-[11px] font-medium text-foreground-muted">
              Suggestions
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close suggestions"
              className="flex h-5 w-5 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-neutral-800/60 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-foreground-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking of questions…
            </div>
          ) : suggestions && suggestions.length > 0 ? (
            suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onPick(s);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-xs text-foreground-muted transition-colors hover:bg-neutral-800/60 hover:text-foreground"
              >
                {s}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-xs text-foreground-muted">
              No suggestions available right now.
            </div>
          )}
        </div>
      )}
    </div>
  );
}