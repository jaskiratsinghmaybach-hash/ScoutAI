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

const HEADLINE = "Every great shot starts with the right place.";
const WELCOME_MESSAGES = [
  "Welcome back",
  "Ready to scout",
  "Let’s find your next place",
  "Your next great shot awaits",
] as const;

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
  const [welcomeIndex] = useState(() =>
    Math.floor(Math.random() * WELCOME_MESSAGES.length),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecentChats(listAllChats().slice(0, 2));
      setQuickStarts(pickThree().slice(0, 2));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="relative flex h-full min-h-[50vh] w-full flex-col items-center overflow-hidden px-2 py-2">
      {/* Ambient glow behind the headline */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-white/[0.06] blur-[90px]"
      />

      {/* Headline */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative flex w-full max-w-3xl flex-col items-start text-left"
      >
        {displayName && (
          <motion.span
            initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="font-display mb-1 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl"
          >
            {WELCOME_MESSAGES[welcomeIndex]}, {displayName}
          </motion.span>
        )}
        <h1 className="font-display whitespace-nowrap text-[22px] font-medium leading-tight tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-neutral-400 sm:text-[24px]">
          {HEADLINE}
        </h1>
      </motion.div>

      <div className="mt-0 flex w-full max-w-3xl flex-1 flex-col justify-center gap-3">
        {/* Continuity row */}
        <motion.button
          type="button"
          onClick={onOpenContinuity}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
          className="group flex items-center gap-3 rounded-none border border-border bg-neutral-900/60 px-4 py-3.5 text-left backdrop-blur-sm transition-all duration-200 hover:border-border-strong hover:bg-neutral-900 active:scale-[0.99]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800/80 text-neutral-300 transition-colors group-hover:text-white">
            <RefreshCw className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground">
                Continuity
              </span>
              {!user && (
                <span className="inline-flex items-center gap-1 rounded-full bg-neutral-700/50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />
                  Local only
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[12px] leading-relaxed text-foreground-muted">
              {user
                ? "Merge local and account chats any time."
                : "Sign in to back up or merge your chats."}
            </p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
        </motion.button>

        {/* Recent activity + Quick start */}
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Recent Scout activity */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
            className="flex flex-col rounded-none border border-border bg-neutral-900/60 p-4 backdrop-blur-sm"
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
            className="flex flex-col rounded-none border border-border bg-neutral-900/60 p-4 backdrop-blur-sm"
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