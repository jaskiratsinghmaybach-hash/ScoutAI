"use client";

import { MapPin } from "lucide-react";
import type { Location } from "@/types";

/**
 * Replaces the old Imagery tab. Describes the physical environment and
 * setting itself — what the place looks and feels like — using
 * scene_description, a field Gemini generates specifically for this
 * (see agent.ts's synthesizeLocations prompt). Deliberately distinct
 * from ShootTab: Shoot covers WHY the location fits the brief and HOW
 * to shoot there; Scene covers what the place physically is.
 */
export function SceneTab({ location }: { location: Location }) {
  const hasDescription =
    location.scene_description && location.scene_description.trim().length > 0;

  return (
    <div className="h-full space-y-4 px-1 py-1">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
        <MapPin className="h-3.5 w-3.5" />
        {location.city && location.country
          ? `${location.city}, ${location.country}`
          : location.country || location.city || "Location"}
      </div>

      <p className="text-sm leading-relaxed text-foreground">
        {hasDescription ? (
          location.scene_description
        ) : (
          <span className="text-foreground-muted">
            No scene description available for this location yet.
          </span>
        )}
      </p>
    </div>
  );
}