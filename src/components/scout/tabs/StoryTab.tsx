"use client";

import { FileText } from "lucide-react";
import type { Location } from "@/types";

/**
 * KNOWN GAP: `Location` has no description/narrative field. The
 * closest existing fields (weather_notes, logistics_notes) are Shoot-
 * tab material, not a place description — using them here would be
 * mislabeled content, not a real Story tab. Flagging plainly rather
 * than inventing narrative text. Swap this whole body out for
 * `location.description` (or whatever field name the backend adds)
 * once it exists — the empty-state branch below is the only thing to
 * remove.
 */
export function StoryTab({ location }: { location: Location }) {
  const description: string | undefined = undefined; // no such field on Location yet

  if (!description) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-foreground-muted">
        <FileText className="h-6 w-6 text-foreground-muted" />
        <span>No story written for {location.name} yet</span>
        <span className="max-w-xs text-xs text-foreground-muted/70">
          The scout pipeline doesn&apos;t currently return a narrative/description
          field — this needs to be added upstream.
        </span>
      </div>
    );
  }

  return (
    <div className="h-full text-sm leading-relaxed text-foreground">
      {description}
    </div>
  );
}