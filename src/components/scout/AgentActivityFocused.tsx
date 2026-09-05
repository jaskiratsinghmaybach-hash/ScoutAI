"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { AgentTrace } from "@/components/scout/AgentTrace";
import type { ScoutRun } from "@/types";

/**
 * Rendered as an absolutely-positioned overlay on top of whatever the
 * right panel is currently showing (idle placeholder or a previous
 * run's cards). The layer beneath is blurred via a sibling wrapper in
 * ResultsPanel — this component only owns the focused AgentTrace card
 * itself and its own entrance/exit.
 *
 * ResultsPanel already dismisses this back to the cards view via a
 * click on the blurred backdrop (see the click-through button
 * rendered behind this one there) — onClose adds the second,
 * more discoverable affordance: an explicit × directly on the panel.
 * Both call the same onCloseFocused handler one level up.
 */
export function AgentActivityFocused({
  run,
  onClose,
  onRetry,
  isRetrying,
}: {
  run: ScoutRun;
  onClose: () => void;
  onRetry?: (options?: { forceFresh?: boolean }) => void;
  isRetrying?: boolean;
}) {
  return (
    <motion.div
      key={run.id}
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -8 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="absolute inset-0 z-20 flex items-center justify-center p-8"
    >
      <div className="relative w-full max-w-md">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close agent activity"
          className="absolute -top-3 -right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-foreground-muted shadow-md ring-1 ring-border transition-colors hover:bg-neutral-800 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <AgentTrace
          steps={run.steps}
          runKind={run.runKind}
          error={run.error}
          onRetry={onRetry}
          isRetrying={isRetrying}
          isDone={Boolean(run.packet)}
        />
      </div>
    </motion.div>
  );
}