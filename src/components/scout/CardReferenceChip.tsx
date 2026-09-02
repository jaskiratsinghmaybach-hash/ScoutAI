"use client";

import { MapPin } from "lucide-react";
import type { Location } from "@/types";

/**
 * Rendered above/alongside a user message in the chat thread when that
 * message was sent with a card attached (see ConversationTurn.attachedCard
 * in types/index.ts). Distinct from AttachedCardChip — this one is
 * historical record on an already-sent message, not an editable
 * pre-send state, so it has no remove/dismiss action.
 */
export function CardReferenceChip({
  scope,
  locations,
}: {
  scope: "single" | "all";
  locations: Location[];
}) {
  const label =
    scope === "all"
      ? `Referencing all ${locations.length} locations`
      : `Referencing ${locations[0]?.name ?? "a location"}`;

  return (
    <div className="mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-neutral-800/40 px-2.5 py-1 text-[11px] font-medium text-neutral-400">
      <MapPin className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}