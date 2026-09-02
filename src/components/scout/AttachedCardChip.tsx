"use client";

import { X, MapPin } from "lucide-react";
import type { Location } from "@/types";

/**
 * Sits inside/above the message input, visually confirming to the
 * user that Scout now has a specific card (or all shown cards)
 * attached as context for their next message — set by either clicking
 * "Add to chat" directly, or by clicking a suggestion chip (which
 * attaches AND pre-fills the message text in one action). Dismissible
 * independently of the message text itself.
 */
export function AttachedCardChip({
  scope,
  locations,
  onRemove,
}: {
  scope: "single" | "all";
  locations: Location[];
  onRemove: () => void;
}) {
  const label =
    scope === "all"
      ? `All ${locations.length} locations`
      : locations[0]?.name ?? "Location";

  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-neutral-800/60 px-3 py-1.5 text-xs font-medium text-neutral-300 backdrop-blur-sm">
      <MapPin className="h-3 w-3 shrink-0 text-foreground-muted" />
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
        aria-label="Remove attached card"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}