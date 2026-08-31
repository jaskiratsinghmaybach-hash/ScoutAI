"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScoutRun } from "@/types";

const STEP_LABELS = [
  "Analyzing scene requirements",
  "Searching for real locations",
  "Scouting and ranking locations",
  "Writing scout's report",
  "Gathering imagery",
];

/**
 * Minimized, always-in-corner indicator for the run currently tracked
 * by ResultsPanel (see mini-pill lifecycle notes there). Shows the
 * current step label with a live tick as each step completes; turns
 * green and becomes clickable once the run's packet has landed and its
 * cards haven't been opened yet. Disappears entirely once the cards
 * have been opened (ResultsPanel stops rendering it — this component
 * has no "closed" state of its own).
 */
export function AgentActivityMiniPill({
  run,
  onClick,
}: {
  run: ScoutRun;
  onClick: () => void;
}) {
  const isDone = run.packet !== null;
  const runningStep = run.steps.find((s) => s.status === "running");
  const lastDoneStep = [...run.steps]
    .filter((s) => s.status === "done")
    .sort((a, b) => b.step - a.step)[0];
  const currentStep = runningStep ?? lastDoneStep ?? run.steps[0];
  const label = currentStep
    ? STEP_LABELS[currentStep.step - 1] ?? currentStep.action
    : "Starting...";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      initial={{ opacity: 0, scale: 0.9, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -4 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-colors duration-200 active:scale-95",
        isDone
          ? "bg-success/15 text-success ring-1 ring-success/40 hover:bg-success/25"
          : "bg-neutral-800/70 text-neutral-200 ring-1 ring-white/10 hover:bg-neutral-800",
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDone ? (
          <motion.span
            key="done"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.3, ease: "backOut" }}
            className="flex h-3.5 w-3.5 items-center justify-center"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </motion.span>
        ) : (
          <motion.span
            key={currentStep?.step ?? "pending"}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white"
          />
        )}
      </AnimatePresence>
      <span className="max-w-45 truncate font-mono">
        {isDone ? "Ready — view locations" : label}
      </span>
    </motion.button>
  );
}