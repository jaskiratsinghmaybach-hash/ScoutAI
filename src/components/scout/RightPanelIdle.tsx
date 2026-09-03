"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import { RefreshCw, History, Sparkles, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { listAllChats, type ChatSummary } from "@/lib/chatStorage";
import { SCENE_SUGGESTIONS } from "@/data/suggestions";
import type { SyncStatus } from "@/lib/useAuth";

/**
 * Idle state of the right panel — shown whenever there's no active
 * scout packet to display. This panel is wide (900px+ in practice),
 * so layout is: a centered headline, then a full-width Continuity
 * row, then Recent activity + Quick start side by side below it.
 * Both of those cards size to their own content — they never
 * stretch to fill leftover space, so a single recent chat doesn't
 * get centered inside an oversized empty box.
 *
 * Opening Continuity or jumping into a past chat both hand off to
 * state that already lives in ScoutApp; the quick-start chips call
 * straight into handleInitialSubmit via onQuickStart, so picking one
 * here does exactly what typing it into the composer and hitting
 * enter would do.
 */

const HEADLINE = "Every great shot starts with the right place.";

interface RightPanelIdleProps {
  user: User | null;
  syncStatus: SyncStatus;
  onOpenContinuity: () => void;
  onQuickStart: (text: string) => void;
  displayName?: string | null;
}

function pickThree(): string[] {
  return [...SCENE_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 3);
}

export function RightPanelIdle({
  user,
  syncStatus,
  onOpenContinuity,
  onQuickStart,
  displayName,
}: RightPanelIdleProps) {
  const router = useRouter();
  const [recentChats, setRecentChats] = useState<ChatSummary[]>([]);
  const [quickStarts, setQuickStarts] = useState<string[]>([]);

  // Both read from localStorage / re-shuffle client-side — deferred a
  // tick past mount, same pattern ChatsList uses, so hydration never
  // has to reconcile server vs. client output.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecentChats(listAllChats().slice(0, 2));
      setQuickStarts(pickThree().slice(0, 2));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const syncLabel =
    syncStatus === "syncing"
      ? "Syncing…"
      : syncStatus === "pending"
        ? "Sync pending"
        : user
          ? "Synced"
          : "Local only";

  return (
    <div className="relative flex h-full min-h-[50vh] w-full flex-col items-center overflow-hidden px-2 py-2">
      {/* Ambient glow behind the headline — quiet, monochrome, no clashing color */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-white/[0.06] blur-[90px]"
      />

      {/* Headline */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative flex flex-col items-center text-center"
      >
        {displayName && (
          <span className="font-display mb-1.5 text-sm font-medium text-neutral-400">
            Welcome back, {displayName}
          </span>
        )}
        <h1 className="font-display max-w-lg text-balance text-[34px] font-bold leading-[1.08] tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-neutral-400 sm:text-[38px]">
          {HEADLINE}
        </h1>
      </motion.div>

      {/* Below the headline: Continuity spans full width (it's a single
          status/action row), then Recent activity + Quick start sit
          side by side on wide panels — this panel is often 900px+
          wide in practice, so a single narrow max-w-md column just
          leaves most of the space empty. Both cards size to their own
          content (no flex-1 stretch), so a sparse list never gets
          centered inside a tall empty box. */}
      <div className="mt-6 flex w-full max-w-3xl flex-1 flex-col justify-center gap-3">
        {/* Continuity row */}
        <motion.button
          type="button"
          onClick={onOpenContinuity}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
          className="group flex items-center gap-3 rounded-xl border border-border bg-neutral-900/60 px-4 py-3.5 text-left backdrop-blur-sm transition-all duration-200 hover:border-border-strong hover:bg-neutral-900 active:scale-[0.99]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800/80 text-neutral-300 transition-colors group-hover:text-white">
            <RefreshCw className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground">
                Continuity
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  syncStatus === "syncing"
                    ? "bg-amber-400/10 text-amber-400"
                    : user
                      ? "bg-emerald-400/10 text-emerald-400"
                      : "bg-neutral-700/50 text-neutral-400",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    syncStatus === "syncing"
                      ? "bg-amber-400 animate-pulse"
                      : user
                        ? "bg-emerald-400"
                        : "bg-neutral-500",
                  )}
                />
                {syncLabel}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[12px] leading-relaxed text-foreground-muted">
              {user
                ? "Merge local and account chats any time."
                : "Sign in to back up or merge your chats."}
            </p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
        </motion.button>

        {/* Recent activity + Quick start, side by side on wider panels */}
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Recent Scout activity */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
            className="flex flex-col rounded-xl border border-border bg-neutral-900/60 p-4 backdrop-blur-sm"
          >
            <div className="flex items-center gap-1.5 px-0.5">
              <History className="h-3.5 w-3.5 text-neutral-400" />
              <span className="text-[13px] font-semibold text-foreground">
                Recent Scout activity
              </span>
            </div>

            {recentChats.length === 0 ? (
              <p className="mt-2 px-0.5 text-[12px] leading-relaxed text-foreground-muted">
                Your scouted packets will show up here.
              </p>
            ) : (
              <div className="mt-2.5 flex flex-col gap-1.5">
                {recentChats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => router.push(`/chat/${chat.id}`)}
                    className="group flex w-full items-center justify-between gap-3 rounded-lg bg-neutral-800/60 px-3 py-2.5 text-left transition-all duration-200 hover:bg-neutral-800 active:scale-[0.99]"
                  >
                    <span className="truncate text-[12.5px] font-medium text-neutral-200 group-hover:text-white">
                      {chat.title}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-neutral-500 group-hover:text-neutral-300">
                      {chat.lastUpdated
                        ? new Date(chat.lastUpdated).toLocaleDateString()
                        : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Quick start */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.24, ease: "easeOut" }}
            className="flex flex-col rounded-xl border border-border bg-neutral-900/60 p-4 backdrop-blur-sm"
          >
            <div className="flex items-center gap-1.5 px-0.5">
              <Sparkles className="h-3.5 w-3.5 text-neutral-400" />
              <span className="text-[13px] font-semibold text-foreground">
                Quick start
              </span>
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {quickStarts.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => onQuickStart(text)}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg bg-neutral-800/60 px-3 py-2.5 text-left transition-all duration-200 hover:bg-neutral-800 active:scale-[0.99]"
                >
                  <span className="truncate text-[12.5px] text-neutral-300 group-hover:text-white">
                    {text}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-neutral-500 transition-colors group-hover:text-white" />
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}