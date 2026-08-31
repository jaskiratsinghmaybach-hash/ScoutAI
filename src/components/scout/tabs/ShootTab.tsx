"use client";

import type { Location } from "@/types";

function Block({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
        {label}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground">
        {value && value.trim().length > 0 ? (
          value
        ) : (
          <span className="text-foreground-muted">Not provided yet</span>
        )}
      </p>
    </div>
  );
}

/**
 * Maps to real Location fields — mood_match/era_match feed "why this
 * location fits," weather_notes covers recommended timing,
 * logistics_notes covers shooting approach. No invented content.
 */
export function ShootTab({ location }: { location: Location }) {
  return (
    <div className="h-full space-y-5 px-1 py-1">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Block label="Mood fit" value={location.mood_match} />
        <Block label="Era fit" value={location.era_match} />
      </div>
      <Block label="Recommended shooting times" value={location.weather_notes} />
      <Block label="Shooting approach & logistics" value={location.logistics_notes} />
    </div>
  );
}