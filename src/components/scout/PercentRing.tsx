"use client";

import { motion } from "framer-motion";

/**
 * Small circular progress ring. `percent === null` renders a dashed,
 * empty ring with a "—" instead of a fabricated value — used whenever
 * mood_match/era_match can't be parsed into a number for this location.
 */
export function PercentRing({
  percent,
  size = 44,
  strokeWidth = 4,
}: {
  percent: number | null;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset =
    percent === null ? 0 : circumference - (percent / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className={percent === null ? "text-border" : "text-border/60"}
          strokeDasharray={percent === null ? "3 4" : undefined}
        />
        {percent !== null && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="text-success"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-foreground">
        {percent === null ? "—" : `${Math.round(percent)}%`}
      </div>
    </div>
  );
}