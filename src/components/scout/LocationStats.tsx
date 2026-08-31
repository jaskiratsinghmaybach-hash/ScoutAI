"use client";

import { motion } from "framer-motion";
import { PercentRing } from "./PercentRing";
import { parsePercent } from "./location-card-utils";
import type { Location } from "@/types";

/**
 * All four values come straight from the scout agent's own output on
 * this Location (score, mood_match, era_match, avg_daily_cost) — none
 * of this is computed or guessed client-side. mood_match/era_match are
 * parsed from their "NN%"-style strings; if a value doesn't parse, the
 * ring shows an explicit empty state rather than a fake number.
 */
export function LocationStats({ location }: { location: Location }) {
  const mood = parsePercent(location.mood_match);
  const era = parsePercent(location.era_match);

  return (
    <motion.div
      key={location.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex w-full flex-col gap-3"
    >
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          Scout&apos;s Score
        </div>
        <div className="mt-1 text-2xl font-semibold text-foreground">
          {location.score}
          <span className="text-sm font-normal text-foreground-muted">/100</span>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <PercentRing percent={mood} />
        <span className="text-sm text-foreground">Mood Fit</span>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <PercentRing percent={era} />
        <span className="text-sm text-foreground">Era match</span>
      </div>

      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          Est daily cost
        </div>
        <div className="mt-1 text-sm text-foreground">
          {location.avg_daily_cost || "Not available yet"}
        </div>
      </div>
    </motion.div>
  );
}