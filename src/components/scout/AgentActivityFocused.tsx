"use client";

import { motion } from "framer-motion";
import { AgentTrace } from "@/components/scout/AgentTrace";
import type { ScoutRun } from "@/types";

/**
 * Rendered as an absolutely-positioned overlay on top of whatever the
 * right panel is currently showing (idle placeholder or a previous
 * run's cards). The layer beneath is blurred via a sibling wrapper in
 * ResultsPanel — this component only owns the focused AgentTrace card
 * itself and its own entrance/exit.
 */
export function AgentActivityFocused({ run }: { run: ScoutRun }) {
  return (
    <motion.div
      key={run.id}
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -8 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="absolute inset-0 z-20 flex items-center justify-center p-8"
    >
      <div className="w-full max-w-md">
        <AgentTrace steps={run.steps} />
      </div>
    </motion.div>
  );
}