"use client";

import { motion } from "framer-motion";
import { PercentRing } from "./PercentRing";
import type { Location } from "@/types";

/**
 * All four values come straight from the scout agent's own output on
 * this Location (score, mood_fit_percent, era_fit_percent,
 * avg_daily_cost) — none of this is computed or guessed client-side.
 * mood_fit_percent/era_fit_percent are numbers the agent rates directly
 * (separate from the mood_match/era_match prose explanations shown
 * elsewhere); if the agent didn't return a valid number for this
 * location, the ring shows an explicit empty state rather than a fake
 * percentage.
 */
export function LocationStats({ location }: { location: Location }) {
  const mood = location.mood_fit_percent;
  const era = location.era_fit_percent;

  return (
    <motion.div
      key={location.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex md:w-full md:flex-col md:gap-3"
    >
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5 md:px-4 md:py-3">
        <div className="text-[10px] font-medium uppercase tracking-wide text-foreground-muted md:text-xs">
          Scout&apos;s Score
        </div>
        <div className="mt-0.5 text-xl font-semibold text-foreground md:mt-1 md:text-2xl">
          {location.score}
          <span className="text-xs font-normal text-foreground-muted md:text-sm">/100</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 md:gap-3 md:px-4 md:py-3">
        <PercentRing percent={mood} size={32} className="md:hidden" />
        <PercentRing percent={mood} size={44} className="hidden md:block" />
        <span className="text-xs text-foreground md:text-sm">Mood Fit</span>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 md:gap-3 md:px-4 md:py-3">
        <PercentRing percent={era} size={32} className="md:hidden" />
        <PercentRing percent={era} size={44} className="hidden md:block" />
        <span className="text-xs text-foreground md:text-sm">Era match</span>
      </div>

      <div className="rounded-lg border border-border bg-surface px-3 py-2.5 md:px-4 md:py-3">
        <div className="text-[10px] font-medium uppercase tracking-wide text-foreground-muted md:text-xs">
          Est daily cost
        </div>
        <div className="mt-0.5 truncate text-xs text-foreground md:mt-1 md:text-sm">
          {location.avg_daily_cost || "Not available yet"}
        </div>
      </div>
    </motion.div>
  );
}