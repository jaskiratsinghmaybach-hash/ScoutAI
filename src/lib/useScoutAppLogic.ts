"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { compressToEncodedURIComponent } from "lz-string";
import { useTypewriter } from "@/lib/useTypewriter";
import { getRandomSuggestions } from "@/data/suggestions";
import {
  saveChatState,
  loadChatState,
  generateChatId,
  savePendingDraft,
  loadPendingDraft,
  clearPendingDraft,
} from "@/lib/chatStorage";
import { upsertChat, fetchAccountChatState } from "@/lib/continuitySync";
import { useAuth } from "@/lib/useAuth";
import { useOnboarding } from "@/lib/useOnboarding";
import {
  createEmptyTree,
  addMessage,
  getActivePath,
  setActiveChild,
  treeFromFlatHistory,
  type ConversationTree,
  type MessageNode,
} from "@/lib/conversationTree";
import type {
  SlotState,
  ClarifyQuestion,
  ConversationTurn,
  ScoutRun,
  Location,
  SceneQuery,
} from "@/types";

// Shared BorderGlow styling — same look as the landing page input box,
// used everywhere (clarifying / thinking / running / stopped / done)
// instead of the old purple/green neon variant. Exported so both the
// desktop and mobile views can reuse the exact same look.
export const GLOW_PROPS = {
  borderRadius: 30,
  glowRadius: 36,
  glowIntensity: 0.6,
  coneSpread: 30,
  edgeSensitivity: 25,
  backgroundColor: "#141414",
  colors: ["#ffffff", "#71717a", "#ffffff"] as string[],
  glowColor: "0 0% 95%",
} as const;

type Phase =
  | "intro"
  | "clarifying"
  | "thinking"
  | "running"
  | "stopped"
  | "done";

// Rotating copy for the "thinking" indicator — small polish so it
// doesn't feel like a static, repeated label every time. Picked once
// per phase-transition-into-"thinking" (see the `thinkingMessage` memo
// below), not re-rolled on every render.
const THINKING_MESSAGES = [
  "ScoutAI is thinking...",
  "Scouting locations...",
  "One moment...",
  "Finding the perfect spot...",
] as const;

function pickRandomThinkingMessage(): string {
  return THINKING_MESSAGES[
    Math.floor(Math.random() * THINKING_MESSAGES.length)
  ];
}

const EMPTY_SLOTS: SlotState = {
  description: "",
  mood: "",
  era: "",
  budget: "",
  region: "",
  duration: "",
  requirements: "",
};

export function useScoutAppLogic({ chatId }: { chatId?: string }) {
  const router = useRouter();
  const {
    user,
    syncStatus,
    activeView,
    setActiveView,
    accountChats,
    refreshAccountChats,
    profile,
    refreshProfile,
    isGlowing,
    isDropdownOpen,
    setIsDropdownOpen,
    signInWithGoogle,
    signOut,
    reportWrite,
  } = useAuth();

  const {
    hasOnboarded,
    localDisplayName,
    completeOnboarding,
    setLocalDisplayName,
  } = useOnboarding();
  // A name edited in Continuity intentionally overrides the local
  // onboarding name. Until then, keep showing the local name after auth.
  const effectiveDisplayName = user
    ? (profile?.display_name ?? localDisplayName ?? null)
    : localDisplayName;

  // Gates every send action (landing page + every chat-view input) on
  // onboarding being complete. Checked BOTH in the UI (disabled input,
  // faded/tooltipped button) AND at the top of every submit handler —
  // the handler check is what actually matters; the UI state exists so
  // a blocked user sees why, not just that nothing happened.
  const canSend = hasOnboarded;

  const handleDeleteConfirmedOnCurrentChat = (deletedId: string) => {
    if (chatId && chatId === deletedId) {
      router.push("/");
      setTree(createEmptyTree());
      setSlots(EMPTY_SLOTS);
      setRuns([]);
      setActiveRunId(null);
      setTitle(undefined);
      setPhase("intro");
    }
  };
  const [phase, setPhase] = useState<Phase>("intro");
  // Re-rolled every time something transitions phase to "thinking"
  // (see setThinkingPhase below) so the indicator varies per wait
  // rather than showing the same string every time or re-randomizing
  // pointlessly on every render while already thinking.
  const [thinkingMessage, setThinkingMessage] = useState<string>(
    THINKING_MESSAGES[0],
  );
  const setThinkingPhase = useCallback(() => {
    setThinkingMessage(pickRandomThinkingMessage());
    setPhase("thinking");
  }, []);
  const [introText, setIntroText] = useState("");
  const [userHasEdited, setUserHasEdited] = useState(false);

  // Phase 2 of message branching: the conversation is stored as a tree
  // internally, but `history` is derived from it and kept in exactly
  // the same ConversationTurn[] shape the rest of this file already
  // expects. This means every READ site below (`.map`, `.length`,
  // `.slice`, localStorage/Supabase save-load, etc.) needs ZERO changes
  // — only the WRITE sites (setHistory calls) are converted to tree
  // operations. Branching UI/behavior itself is Phase 3; this phase is
  // "same behavior, different internal representation."
  const [tree, setTree] = useState<ConversationTree>(createEmptyTree());
  const activePathNodes: MessageNode[] = getActivePath(tree);
  const history: ConversationTurn[] = activePathNodes.map((node) => ({
    role: node.role,
    content: node.content,
  }));
  // The id of the currently-active leaf node — i.e. whichever message
  // is last in the active path. Write sites that append a new message
  // need this as the parentId for the new node.


  const [slots, setSlots] = useState<SlotState>(EMPTY_SLOTS);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [currentQuestion, setCurrentQuestion] =
    useState<ClarifyQuestion | null>(null);
  // Initialize based on whether this mount already has a chatId (i.e.
  // we navigated here via router.push to an existing/new chat route),
  // not on a same-instance state transition — router.push to a
  // dynamic route unmounts and remounts this component, so there is
  // no "previous render" to compare hasStarted against in that case.
  // Landing page (no chatId) starts open; any chat route starts closed.
  const [showChatsList, setShowChatsList] = useState(!chatId);
  const [showContinuityModal, setShowContinuityModal] = useState(false);

  // Opens the Continuity modal when the auth dropdown opens. Tracked with
  // a comparison-state (not an effect) per react-hooks/set-state-in-effect:
  // calling setState synchronously in an effect body is flagged even when
  // the dependency array is correct, because effects are meant to sync
  // with external systems, not derive one piece of state from another.
  // Comparing during render and calling setState conditionally is the
  // sanctioned pattern for "state derived from a value that changed."
  const [prevIsDropdownOpen, setPrevIsDropdownOpen] =
    useState(isDropdownOpen);
  if (prevIsDropdownOpen !== isDropdownOpen) {
    setPrevIsDropdownOpen(isDropdownOpen);
    if (isDropdownOpen) {
      setShowContinuityModal(true);
    }
  }
  const [shareCopied, setShareCopied] = useState(false);
  const [shareDialog, setShareDialog] = useState<{
    title: string;
    url: string;
  } | null>(null);

  const [runs, setRuns] = useState<ScoutRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // --- Right panel state (idle / focused agent activity / cards) ---
  // The run currently tracked by the top-left mini pill. Set the
  // instant a run starts (see dispatchScout); cleared the instant that
  // run's cards are opened for the first time — NOT merely when the
  // run finishes. This is what makes the pill "disappear once its
  // cards are opened, dropdown is the way back" behavior work: once
  // cleared, no mini pill renders for that run ever again, even though
  // it's still fully reachable via runHistorySelectedId + the dropdown.
  const [inFlightRunId, setInFlightRunId] = useState<string | null>(null);
  // Non-null while the user has expanded the mini pill into the
  // blurred-behind, focused AgentTrace view.
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null);
  // Which completed run's cards are currently shown on the right.
  // Null = idle placeholder. This is intentionally separate from
  // `activeRunId` (which drives the LEFT chat's ActivityPill highlight
  // and legacy indicators below) so the right panel can be dismissed
  // back to idle without disturbing which run is "active" in the chat.
  const [rightPanelRunId, setRightPanelRunId] = useState<string | null>(null);

  const inFlightRun = runs.find((r) => r.id === inFlightRunId) ?? null;

  function openRunCards(runId: string) {
    setRightPanelRunId(runId);
    setActiveRunId(runId);
    setFocusedRunId(null);
    // Clear the mini pill permanently for this run once its cards have
    // been opened at least once — dropdown/in-chat pill are the way
    // back to it after this point.
    setInFlightRunId((prev) => (prev === runId ? null : prev));
  }

  function handlePillClick(run: ScoutRun) {
    setActiveRunId(run.id);
    setRightPanelRunId(run.id);

    if (!run.packet) {
      // In-flight, paused, stuck, or errored: always open focused agent activity view
      setFocusedRunId(run.id);
    } else {
      // Completed run: if its cards are already open, toggle focused trace; otherwise open cards
      if (rightPanelRunId === run.id && !focusedRunId) {
        setFocusedRunId(run.id);
      } else {
        setFocusedRunId(null);
        setInFlightRunId((prev) => (prev === run.id ? null : prev));
      }
    }
  }

  const [isRetryingRunId, setIsRetryingRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const [isFollowingUp, setIsFollowingUp] = useState(false);
  // Card attachment state — set by "Add to chat" or a suggestion chip
  // (either the per-card CardSuggestions dropdown or the broad
  // BroadSuggestions row above the message box). Cleared once the
  // message carrying it is actually sent, or if the user removes it
  // manually via the chip's own dismiss button.
  const [attachedCard, setAttachedCard] = useState<
    { scope: "single" | "all"; locations: Location[] } | null
  >(null);
  const [isClassifyingCardChat, setIsClassifyingCardChat] = useState(false);
  const [suggestionPrefill, setSuggestionPrefill] = useState<
    string | undefined
  >(undefined);
  const [landingSuggestions, setLandingSuggestions] = useState<string[]>([]);
  useEffect(() => {
    const suggestionsTimer = window.setTimeout(() => {
      setLandingSuggestions(getRandomSuggestions(3));
    }, 0);

    return () => window.clearTimeout(suggestionsTimer);
  }, []);
  const typewriter = useTypewriter(landingSuggestions, {
    typeSpeed: 45,
    dwellMs: 2200,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  // Replaces the old SSE streamReaderRef. dispatchScout no longer holds
  // a fetch stream open — it POSTs once to kick off the pipeline, then
  // polls GET /api/scout/[runId] on this interval. Kept as a ref (not
  // state) for the same reason streamReaderRef was: handleStop/
  // handleSwitchBranch/handleNewChat need to synchronously tear it down
  // without waiting for a re-render.
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasStoppedRef = useRef(false);
  const stoppedDuringRef = useRef<"clarify" | "research">("clarify");
  const lastScoutArgsRef = useRef<{
    finalSlots: SlotState;
    priorContext?: string;
  }>({ finalSlots: EMPTY_SLOTS });
  const hasStarted = phase !== "intro";
  const hydratedRef = useRef(false);
  // Mirrors hydratedRef as real state (not just a ref) specifically so
  // the save-effect below can depend on it directly and is guaranteed
  // to re-run exactly once hydration finishes — a ref mutation alone
  // doesn't reliably re-trigger a dependent effect if no other dep in
  // that effect happens to change at the same tick.
  const [hasHydrated, setHasHydrated] = useState(false);

  // Persist which run's cards are open on the right panel so a refresh
  // restores the same card instead of dropping back to idle.
  // Deliberately separate from the main saveChatState/loadChatState
  // path (see hydration effect above/below) — this is transient UI
  // state, not conversation data, and doesn't need Supabase sync.
  // Gated on hasHydrated (not just chatId) so it can never fire before
  // the restore read has actually happened — otherwise the very first
  // render's default `rightPanelRunId = null` could race ahead and
  // clear a value that hasn't been restored yet.
  //
  // Writes an explicit "__dismissed__" sentinel (not just deleting the
  // key) when the user closes the panel via the ✕ button, so restore
  // can tell "explicitly dismissed, stay idle" apart from "never
  // opened anything, fall back to most recent run" — a missing key and
  // a deliberately-cleared one would otherwise look identical.
  useEffect(() => {
    if (!chatId || !hasHydrated) return;
    try {
      const key = `scout:rightPanelRunId:${chatId}`;
      window.localStorage.setItem(key, rightPanelRunId ?? "__dismissed__");
    } catch {
      // Non-fatal — storage can be unavailable (private mode, quota).
    }
  }, [chatId, hasHydrated, rightPanelRunId]);


  const generateChatTitle = useCallback(
    async (
      finalSlots: SlotState,
      currentHistory: ConversationTurn[],
    ) => {
      if (!chatId) return;
      try {
        const res = await fetch("/api/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history: currentHistory,
            description: finalSlots.description,
          }),
        });
        if (!res.ok) return;
        const { title: aiTitle } = await res.json();
        if (aiTitle && aiTitle.trim().length > 0) {
          setTitle(aiTitle.trim());
        }
      } catch (err) {
        console.error("Title generation failed:", err);
        // Silently fail — fallback title already set from description
      }
    },
    [chatId],
  );

  const dispatchScout = useCallback(
    async (
      finalSlots: SlotState,
      prompt?: string,
      historyContext?: ConversationTurn[],
      runKind: "search" | "refine" = "search",
    ) => {
      setPhase("running");
      setError(null);
      wasStoppedRef.current = false;
      stoppedDuringRef.current = "research";

      lastScoutArgsRef.current = { finalSlots, priorContext: prompt };

      const runId = generateChatId();
      let isFirstRun = false;
      const activeHistory = historyContext || [];
      const lastTurn = activeHistory[activeHistory.length - 1];

      const initialRun: ScoutRun = {
        id: runId,
        steps: [
          {
            step: 1,
            action: "Synthesizing requirements",
            detail: prompt
              ? `Refining scene: "${prompt}"`
              : "Converting brief to scene profile",
            status: "running",
          },
        ],
        packet: null,
        triggerMessageIndex: activeHistory.length - 1,
        triggerMessageContent: lastTurn ? lastTurn.content : "",
        runKind,
      };

      setRuns((prev) => {
        isFirstRun = prev.length === 0;
        return [...prev, initialRun];
      });
      setActiveRunId(runId);
      setInFlightRunId(runId);
      setFocusedRunId(runId);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch("/api/scout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: finalSlots.description,
            mood: finalSlots.mood,
            era: finalSlots.era,
            budget: (finalSlots.budget || "indie") as
              | "micro"
              | "indie"
              | "mid"
              | "studio",
            region: finalSlots.region,
            requirements: finalSlots.requirements
              ? finalSlots.requirements.split(",").map((r: string) => r.trim())
              : [],
            priorContext: prompt,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(
            `Failed to start scout run (status ${res.status}: ${detail || res.statusText || "no body"})`,
          );
        }

        const { runId: scoutRunId, error: startError } = (await res.json()) as {
          runId?: string;
          error?: string;
        };
        if (!scoutRunId) {
          throw new Error(startError || "Scout run did not return a run id");
        }

        await new Promise<void>((resolve, reject) => {
          const poll = async () => {
            if (controller.signal.aborted) {
              resolve();
              return;
            }
            try {
              const statusRes = await fetch(`/api/scout/${scoutRunId}`, {
                signal: controller.signal,
              });
              if (!statusRes.ok) {
                throw new Error(`Status check failed (${statusRes.status})`);
              }
              const data = (await statusRes.json()) as {
                status: "running" | "done" | "error";
                steps: typeof initialRun.steps;
                packet: ScoutRun["packet"];
                error: string | null;
              };

              setRuns((prev) =>
                prev.map((r) => (r.id === runId ? { ...r, steps: data.steps } : r)),
              );

              if (data.status === "done") {
                if (pollTimerRef.current) {
                  clearInterval(pollTimerRef.current);
                  pollTimerRef.current = null;
                }
                setRuns((prev) =>
                  prev.map((r) => {
                    if (r.id !== runId) return r;
                    const finishedSteps = r.steps.map((s) => ({
                      ...s,
                      status: s.status === "running" ? ("done" as const) : s.status,
                    }));
                    return { ...r, steps: finishedSteps, packet: data.packet };
                  }),
                );
                setPhase("done");

                // Generate AI title only on the FIRST completed run, and only if not already custom-renamed
                if (isFirstRun) {
                  generateChatTitle(finalSlots, activeHistory);
                }
                resolve();
              } else if (data.status === "error") {
                if (pollTimerRef.current) {
                  clearInterval(pollTimerRef.current);
                  pollTimerRef.current = null;
                }
                setError(data.error || "Scout pipeline failed");
                setPhase("clarifying");
                resolve();
              }
            } catch (err) {
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }
              reject(err);
            }
          };

          poll();
          pollTimerRef.current = setInterval(poll, 2000);
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          setPhase("stopped");
          return;
        }
        console.error(err);
        setError(err instanceof Error ? err.message : "Scout pipeline failed");
        setPhase("clarifying");
      } finally {
        abortControllerRef.current = null;
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    },
    [generateChatTitle],
  );

  const handleRetryRun = useCallback(
    async (targetRunId: string, options?: { forceFresh?: boolean }) => {
      const run = runs.find((r) => r.id === targetRunId);
      if (!run) return;

      const forceFresh = Boolean(options?.forceFresh);

      setIsRetryingRunId(targetRunId);
      setError(null);
      wasStoppedRef.current = false;
      stoppedDuringRef.current = "research";

      setActiveRunId(targetRunId);
      setRightPanelRunId(targetRunId);
      setFocusedRunId(targetRunId);
      setInFlightRunId(targetRunId);
      setPhase("running");

      // Mark running in steps
      setRuns((prev) =>
        prev.map((r) => {
          if (r.id !== targetRunId) return r;
          if (forceFresh) {
            return {
              ...r,
              status: "running",
              error: null,
              packet: null,
              steps: [
                {
                  step: 1,
                  action: "Analyzing scene requirements",
                  detail: "Starting fresh research with strict real-world property criteria...",
                  status: "running",
                },
              ],
            };
          }
          const updatedSteps = r.steps.map((s) => {
            if (s.status === "error" || s.status === "running") {
              return { ...s, status: "running" as const };
            }
            return s;
          });
          return { ...r, status: "running", error: null, steps: updatedSteps };
        }),
      );

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const query: SceneQuery = {
          description:
            slots.description ||
            run.triggerMessageContent ||
            "Film scene location scouting",
          mood: slots.mood || "",
          era: slots.era || "",
          budget: (slots.budget || "indie") as
            | "micro"
            | "indie"
            | "mid"
            | "studio",
          region: slots.region || "",
          requirements: slots.requirements
            ? slots.requirements.split(",").map((req: string) => req.trim())
            : [],
          priorContext: run.triggerMessageContent,
        };

        const res = await fetch("/api/scout/retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: run.serverRunId || run.id,
            query,
            forceFresh,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({ error: "Retry failed" }))) as { error?: string };
          throw new Error(errData.error || `Retry failed (${res.status})`);
        }

        const data = (await res.json()) as {
          runId?: string;
          packet?: ScoutRun["packet"];
          completedImmediately?: boolean;
        };

        const effectiveRunId = data.runId || targetRunId;

        setRuns((prev) =>
          prev.map((r) =>
            r.id === targetRunId ? { ...r, serverRunId: effectiveRunId } : r,
          ),
        );

        if (data.packet) {
          setRuns((prev) =>
            prev.map((r) => {
              if (r.id !== targetRunId) return r;
              const finishedSteps = r.steps.map((s) => ({
                ...s,
                status: "done" as const,
              }));
              return {
                ...r,
                steps: finishedSteps,
                packet: data.packet ?? null,
                status: "done",
              };
            }),
          );
          setPhase("done");
          openRunCards(targetRunId);
          return;
        }

        await new Promise<void>((resolve, reject) => {
          const poll = async () => {
            if (controller.signal.aborted) {
              resolve();
              return;
            }
            try {
              const statusRes = await fetch(`/api/scout/${effectiveRunId}`, {
                signal: controller.signal,
              });
              if (!statusRes.ok) {
                throw new Error(`Status check failed (${statusRes.status})`);
              }
              const pollData = (await statusRes.json()) as {
                status: "running" | "done" | "error";
                steps: typeof run.steps;
                packet: ScoutRun["packet"];
                error: string | null;
              };

              setRuns((prev) =>
                prev.map((r) =>
                  r.id === targetRunId
                    ? {
                      ...r,
                      steps: pollData.steps || r.steps,
                      error: pollData.error,
                      status: pollData.status,
                    }
                    : r,
                ),
              );

              if (pollData.status === "done") {
                if (pollTimerRef.current) {
                  clearInterval(pollTimerRef.current);
                  pollTimerRef.current = null;
                }
                setRuns((prev) =>
                  prev.map((r) => {
                    if (r.id !== targetRunId) return r;
                    const finishedSteps = (pollData.steps || r.steps).map((s) => ({
                      ...s,
                      status: s.status === "running" ? ("done" as const) : s.status,
                    }));
                    return {
                      ...r,
                      steps: finishedSteps,
                      packet: pollData.packet,
                      status: "done",
                    };
                  }),
                );
                setPhase("done");
                openRunCards(targetRunId);
                resolve();
              } else if (pollData.status === "error") {
                if (pollTimerRef.current) {
                  clearInterval(pollTimerRef.current);
                  pollTimerRef.current = null;
                }
                setError(pollData.error || "Scout pipeline failed");
                setPhase("clarifying");
                resolve();
              }
            } catch (err) {
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }
              reject(err);
            }
          };

          poll();
          pollTimerRef.current = setInterval(poll, 2000);
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          setPhase("stopped");
          return;
        }
        console.error("Retry failed:", err);
        const msg = err instanceof Error ? err.message : "Retry failed";
        setError(msg);
        setRuns((prev) =>
          prev.map((r) => {
            if (r.id !== targetRunId) return r;
            const erroredSteps = r.steps.map((s, idx, arr) => {
              if (idx === arr.length - 1 || s.status === "running") {
                return { ...s, status: "error" as const, detail: msg };
              }
              return s;
            });
            return { ...r, steps: erroredSteps, error: msg, status: "error" };
          }),
        );
        setPhase("clarifying");
      } finally {
        setIsRetryingRunId(null);
        abortControllerRef.current = null;
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    },
    [runs, slots],
  );


  const askForNextQuestion = useCallback(
    async (
      updatedHistory: ConversationTurn[],
      updatedSlots: SlotState,
    ) => {
      setError(null);
      wasStoppedRef.current = false;
      stoppedDuringRef.current = "clarify";
      setThinkingPhase();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const res = await fetch("/api/clarify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history: updatedHistory, slots: updatedSlots }),
          signal: controller.signal,
        });

        if (wasStoppedRef.current) {
          setPhase("stopped");
          return;
        }

        const data = await res.json();

        if (wasStoppedRef.current) {
          setPhase("stopped");
          return;
        }

        const mergedSlots = { ...updatedSlots, ...data.updated_slots };
        setSlots(mergedSlots);

        const isChatOnly =
          (data.message_type === "greeting" ||
            data.message_type === "small_talk" ||
            data.message_type === "off_topic") &&
          !data.next_question;

        if (data.next_question) {
          setCurrentQuestion(data.next_question);
          setTree((prevTree) => {
            const leafId = getActivePath(prevTree).at(-1)?.id ?? null;
            return addMessage(
              prevTree,
              leafId,
              "assistant",
              data.next_question.text,
            ).tree;
          });
          setPhase("clarifying");
        } else if (isChatOnly) {
          setTree((prevTree) => {
            const leafId = getActivePath(prevTree).at(-1)?.id ?? null;
            return addMessage(
              prevTree,
              leafId,
              "assistant",
              data.chat_reply || "Hey! What scene are you scouting?",
            ).tree;
          });
          setCurrentQuestion(null);
          setPhase("clarifying");
        } else {
          dispatchScout(mergedSlots, undefined, updatedHistory);
        }
      } catch (err) {
        if (
          wasStoppedRef.current ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          setPhase("stopped");
          return;
        }
        setError(
          err instanceof Error ? err.message : "Failed to continue conversation",
        );
        setPhase("clarifying");
      } finally {
        abortControllerRef.current = null;
      }
    },
    [dispatchScout, setThinkingPhase],
  );

  // Sidebar defaults: open on the landing page, closed once any chat
  // (new or existing) actually starts — matching the main conversation
  // view's original behavior, where "Chats" must be clicked manually
  // from then on. Tracked with STATE (not a ref) per the current
  // react-hooks/refs rule, which forbids reading/writing ref.current
  // during render. Comparing against a state value during render, and
  // calling setState synchronously when it changes, is the sanctioned
  // replacement for the old ref-based "adjust state on prop change"
  // pattern: https://react.dev/reference/eslint-plugin-react-hooks/lints/refs
  const [prevHasStarted, setPrevHasStarted] = useState(hasStarted);
  if (prevHasStarted !== hasStarted) {
    setPrevHasStarted(hasStarted);
    if (hasStarted) {
      setShowChatsList(false);
    }
  }

  // Hydrate chat state when chatId, activeView, or user changes
  useEffect(() => {
    if (!chatId) return;
    const targetId = chatId;
    let isCancelled = false;

    async function loadState(id: string) {
      // Re-gate the persistence save-effect for the NEW chat until this
      // hydration pass actually finishes — otherwise, if the user is
      // switching between two already-loaded chats client-side (no full
      // page reload), the previous chat's `hasHydrated = true` would
      // stay true and let the save-effect fire against the new chatId
      // using the old, not-yet-restored rightPanelRunId value.
      //
      // Called from inside this async function body (not synchronously
      // in the effect above), which is the pattern
      // react-hooks/set-state-in-effect allows — it only flags setState
      // called synchronously in the effect body itself.
      setHasHydrated(false);

      let stored: ReturnType<typeof loadChatState> = null;

      if (activeView === "account") {
        if (user) {
          try {
            stored = await fetchAccountChatState(user.id, id);
          } catch {
            stored = null;
          }
          if (!stored) {
            stored = loadChatState(id);
          }
        } else {
          stored = loadChatState(id);
        }
      } else {
        // activeView === "local": existing localStorage loader untouched
        stored = loadChatState(id);
      }

      if (isCancelled) return;
      hydratedRef.current = true;
      setHasHydrated(true);

      if (!stored || !stored.history || stored.history.length === 0) {
        setTree(createEmptyTree());
        setSlots(EMPTY_SLOTS);
        setRuns([]);
        setActiveRunId(null);
        setTitle(undefined);
        setPhase("intro");
        setCurrentQuestion(null);
        setError(null);
        setFollowUpText("");
        // A message typed on the landing page before onboarding was
        // done lands here as a pending draft rather than real history
        // (see handleIntroSubmit). Put it back in the composer so the
        // user sees exactly what they typed, still unsent — marking
        // userHasEdited so it renders as plain typed text rather than
        // the animated placeholder.
        const draft = loadPendingDraft(id);
        if (draft) {
          setIntroText(draft);
          setUserHasEdited(true);
        } else {
          setIntroText("");
        }
        setRightPanelRunId(null);
        return;
      }

      setTree(treeFromFlatHistory(stored.history));
      setSlots(stored.slots);
      setRuns(stored.runs ?? []);
      setTitle(
        stored.title ??
        stored.history.find((h) => h.role === "user")?.content.slice(0, 40),
      );
      setActiveRunId(
        stored.runs?.length ? stored.runs[stored.runs.length - 1].id : null,
      );

      // Restore which run's cards were open on the right panel.
      // Distinguishes three cases via the localStorage value:
      //  - a real run id that still exists → restore those cards
      //  - the "__dismissed__" sentinel → user explicitly closed the
      //    panel before refreshing; respect that and stay idle
      //  - missing entirely (key never written — a chat that's never
      //    had its panel touched, e.g. loaded from Supabase/another
      //    device) → fall back to the most recent completed run
      //    (mirrors activeRunId above, set from `stored.runs` directly)
      //    so a fresh load still lands somewhere useful instead of a
      //    blank panel.
      const mostRecentCompletedRun = [...(stored.runs ?? [])]
        .reverse()
        .find((r) => r.packet);
      let restoredRightPanelRunId: string | null = null;
      try {
        const key = `scout:rightPanelRunId:${id}`;
        const saved =
          typeof window !== "undefined" ? window.localStorage.getItem(key) : null;

        if (saved === "__dismissed__") {
          restoredRightPanelRunId = null;
        } else if (saved && stored.runs?.some((r) => r.id === saved && r.packet)) {
          restoredRightPanelRunId = saved;
        } else if (saved === null) {
          // Key never written for this chat — safe default.
          restoredRightPanelRunId = mostRecentCompletedRun?.id ?? null;
        } else {
          // Saved id points at a run that no longer exists/has no
          // packet — safest to fall back rather than show nothing.
          restoredRightPanelRunId = mostRecentCompletedRun?.id ?? null;
        }
      } catch {
        // localStorage can throw in some environments (private mode,
        // disabled storage) — fall back to most-recent rather than idle.
        restoredRightPanelRunId = mostRecentCompletedRun?.id ?? null;
      }

      const mostRecentUncompletedRun = [...(stored.runs ?? [])]
        .reverse()
        .find((r) => !r.packet);
      if (mostRecentUncompletedRun) {
        setInFlightRunId(mostRecentUncompletedRun.id);
        setActiveRunId(mostRecentUncompletedRun.id);
        if (!restoredRightPanelRunId) {
          restoredRightPanelRunId = mostRecentUncompletedRun.id;
        }
      }

      setRightPanelRunId(restoredRightPanelRunId);

      if (stored.runs?.some((r) => r.packet)) {
        setPhase("done");
      } else if (
        stored.history.length === 1 &&
        stored.history[0].role === "user"
      ) {
        setThinkingPhase();
        try {
          await askForNextQuestion(stored.history, stored.slots);
        } catch {
          setPhase("clarifying");
        }
      } else if (stored.history.length > 0) {
        setPhase("clarifying");
      }
    }

    loadState(targetId);

    return () => {
      isCancelled = true;
    };
  }, [chatId, activeView, user, askForNextQuestion, setThinkingPhase]);

  // Once onboarding completes, a pending draft has done its job — the
  // text is already sitting in introText for the user to review and
  // send themselves. Just drop the stored draft record so it doesn't
  // resurface on a later visit to this chat.
  useEffect(() => {
    if (chatId && hasOnboarded) {
      clearPendingDraft(chatId);
    }
  }, [chatId, hasOnboarded]);

  function handleInitialSubmit(textToSubmit?: string) {
    if (!canSend) return;
    const message = (textToSubmit || followUpText || introText).trim();
    if (message.length < 3) return;
    setFollowUpText("");
    setIntroText("");
    const newHistory: ConversationTurn[] = [{ role: "user", content: message }];
    const newSlots = { ...EMPTY_SLOTS, description: message };
    setTitle(message.slice(0, 40));
    setTree(treeFromFlatHistory(newHistory));
    setSlots(newSlots);
    askForNextQuestion(newHistory, newSlots);
  }

  // Persist to localStorage only when there is actual conversation history
  useEffect(() => {
    if (!chatId || !hydratedRef.current || history.length === 0) return;
    saveChatState(chatId, { history, slots, runs, title });
    // Continuity: additive dual-write to Supabase, only when signed in.
    // Fire-and-forget — never blocks the local experience.
    if (user) {
      const saved = loadChatState(chatId);
      if (saved) {
        reportWrite(upsertChat(chatId, saved));
      }
    }
  }, [chatId, history, slots, runs, title, user, reportWrite]);




  /**
   * Edits a past user message at the given history index. The edited
   * message becomes a new sibling branch under its original parent (see
   * conversationTree.ts) and immediately becomes the active branch, so
   * the UI shows the edit taking effect right away. The previous
   * version is NOT discarded — it remains reachable via the pager ("<
   * N/M >") rendered by UserMessage whenever a node has sibling
   * versions. Slots are reset and re-derived by the model from the
   * truncated history, since we don't keep per-turn slot snapshots.
   */
  function handleEditMessage(index: number, newContent: string) {
    // Abort anything in flight from the old branch before starting fresh
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    setTree((prevTree) => {
      const activePath = getActivePath(prevTree);
      const editedNode = activePath[index];
      if (!editedNode) return prevTree; // defensive: bad index, no-op

      // The new message becomes a SIBLING of the edited node, under its
      // original parent. Every real message — including the very first
      // one — has a real parentId (either another message, or the
      // synthetic root), so this is a single, uniform code path with no
      // special case for editing the first message. See
      // conversationTree.ts's SYNTHETIC ROOT design note for why this
      // matters: without it, editing message #1 had no parent to attach
      // a sibling to and silently discarded the old branch instead.
      const parentId = editedNode.parentId ?? prevTree.rootId;
      const result = addMessage(prevTree, parentId, "user", newContent);

      // The new sibling must become the active branch immediately —
      // otherwise the edit would appear to do nothing, since
      // getActivePath would keep following the original, unedited node.
      return {
        ...result.tree,
        activeChildByParent: {
          ...result.tree.activeChildByParent,
          [parentId]: result.nodeId,
        },
      };
    });

    setCurrentQuestion(null);
    setError(null);
    // Drop any runs that were triggered by messages now removed from
    // the active path (their trigger index is at or after the edit
    // point, since everything from `index` onward is being replaced).
    setRuns((prev) => prev.filter((r) => r.triggerMessageIndex < index));

    const truncatedHistory = history.slice(0, index);
    const updatedHistory: ConversationTurn[] = [
      ...truncatedHistory,
      { role: "user", content: newContent },
    ];
    askForNextQuestion(updatedHistory, EMPTY_SLOTS);
  }

  /**
   * Switches which sibling is active under a given parent — used by the
   * pager (< N/M >) on an edited message. This ONLY moves the pointer;
   * it never auto-triggers a new API call. If the target branch already
   * has downstream messages, they appear immediately via getActivePath.
   * If it's a dead end (never continued), the UI just shows it as the
   * latest message and waits for the user to type, same as ChatGPT.
   */
  function handleSwitchBranch(parentId: string, targetChildId: string) {
    // Abort anything in flight — it belongs to the branch being left,
    // and must never be allowed to land on the newly active one.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    wasStoppedRef.current = true;

    setTree((prevTree) => setActiveChild(prevTree, parentId, targetChildId));
    setCurrentQuestion(null);
    setError(null);

    // If the branch we're leaving was actively running/thinking, that
    // phase belongs to the old branch and shouldn't carry over.
    setPhase((prevPhase) =>
      prevPhase === "running" || prevPhase === "thinking"
        ? "clarifying"
        : prevPhase,
    );
  }

  function handleIntroSubmit(e: React.FormEvent) {
    e.preventDefault();
    const submittedText = (
      userHasEdited ? introText : introText || typewriter.displayText
    ).trim();
    if (submittedText.length < 1) return;

    // The landing page never gates on onboarding — typing and
    // submitting here always works. Onboarding itself only lives in
    // the chat view's right panel, so a message submitted here before
    // onboarding is done can't be sent to the agent yet. In that case
    // we still create the chat and navigate, but stash the message as
    // a pending draft instead of writing it into history: the chat
    // page reads the draft back into its own composer (visibly sitting
    // in the box, unsent) and the user sends it themselves once
    // onboarding finishes.
    if (!canSend) {
      const newId = generateChatId();
      savePendingDraft(newId, submittedText);
      router.push(`/chat/${newId}`);
      return;
    }

    const newHistory: ConversationTurn[] = [
      { role: "user", content: submittedText },
    ];
    const newSlots = { ...EMPTY_SLOTS, description: submittedText };
    const initialTitle = submittedText.slice(0, 40);

    if (!chatId) {
      const newId = generateChatId();
      const newState = {
        history: newHistory,
        slots: newSlots,
        runs: [] as ScoutRun[],
        title: initialTitle,
      };
      saveChatState(newId, newState);
      // Continuity: dual-write the very first save for a new chat
      if (user) {
        const saved = loadChatState(newId);
        if (saved) {
          upsertChat(newId, saved).catch((err) =>
            console.error("[Continuity] Initial chat upsert failed:", err),
          );
        }
      }
      router.push(`/chat/${newId}`);
      return;
    }

    setTitle(initialTitle);
    setTree(treeFromFlatHistory(newHistory));
    setSlots(newSlots);
    askForNextQuestion(newHistory, newSlots);
  }

  const handleShareCurrentChat = () => {
    const payload = {
      history,
      slots,
      runs,
      title,
    };
    if (!payload.history || payload.history.length === 0) return;

    try {
      const compressed = compressToEncodedURIComponent(JSON.stringify(payload));
      const shareUrl = `${window.location.origin}/share#payload=${compressed}`;
      setShareCopied(false);
      setShareDialog({
        title: title ?? "Untitled chat",
        url: shareUrl,
      });
    } catch (err) {
      console.error("Failed to share chat:", err);
    }
  };

  const handleCopyCurrentShareLink = async () => {
    if (!shareDialog) return;

    try {
      await navigator.clipboard.writeText(shareDialog.url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy share link:", err);
    }
  };



  function handleAnswer(answer: string) {
    if (!canSend) return;
    if (!currentQuestion) return;
    // Don't pre-assign the answer to currentQuestion.slot client-side —
    // a vague-branch answer (a suggestion card) may not actually be
    // answering that slot at all. Let the model re-read the conversation
    // and extract into the correct slot(s) itself, same as free text.
    const updatedHistory: ConversationTurn[] = [
      ...history,
      { role: "user", content: answer },
    ];
    setTree((prevTree) => {
      const leafId = getActivePath(prevTree).at(-1)?.id ?? null;
      return addMessage(prevTree, leafId, "user", answer).tree;
    });
    setCurrentQuestion(null);
    setSuggestionPrefill(undefined);
    askForNextQuestion(updatedHistory, slots);
  }

  function handleSkipAll() {
    if (!canSend) return;
    if (history.length === 0) return;
    dispatchScout(slots, undefined, history);
  }



  function handleStop() {
    wasStoppedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPhase("stopped");
    // Note: this only stops the CLIENT from polling further — the
    // server-side pipeline (whichever stage is currently running) is
    // fire-and-forget and will keep running to completion in the
    // background, same as it would if you closed the browser tab
    // during the old SSE version. Its result is simply never picked
    // back up client-side once stopped.
  }

  function handleNewChat() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    router.push("/");
    setPhase("intro");
    setTree(createEmptyTree());
    setSlots(EMPTY_SLOTS);
    setRuns([]);
    setActiveRunId(null);
    setTitle(undefined);
    setCurrentQuestion(null);
    setError(null);
    setFollowUpText("");
    setIntroText("");
    setUserHasEdited(false);
    setShowChatsList(false);
  }

  async function handleFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    const msg = followUpText.trim();
    if (!msg) return;

    setFollowUpText("");

    // No card attached — exactly the original behavior, unchanged.
    if (!attachedCard) {
      setIsFollowingUp(true);

      const updatedHistory: ConversationTurn[] = [
        ...history,
        { role: "user", content: msg },
      ];
      setTree((prevTree) => {
        const leafId = getActivePath(prevTree).at(-1)?.id ?? null;
        return addMessage(prevTree, leafId, "user", msg).tree;
      });

      const updatedSlots = {
        ...slots,
        description: `${slots.description} | Follow-up: ${msg}`,
      };
      setSlots(updatedSlots);

      dispatchScout(updatedSlots, msg, updatedHistory).finally(() => {
        setIsFollowingUp(false);
      });
      return;
    }

    // A card is attached — this message needs classification before
    // anything else happens. Post the user's message to the tree
    // immediately (with the reference chip attached to it) so it
    // appears right away rather than waiting on the classify call.
    const cardForThisMessage = attachedCard;
    setAttachedCard(null);
    setIsClassifyingCardChat(true);

    let userNodeId: string | null = null;
    setTree((prevTree) => {
      const leafId = getActivePath(prevTree).at(-1)?.id ?? null;
      const result = addMessage(prevTree, leafId, "user", msg, cardForThisMessage);
      userNodeId = result.nodeId;
      return result.tree;
    });

    try {
      const res = await fetch("/api/card-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          scope: cardForThisMessage.scope,
          locations: cardForThisMessage.locations,
        }),
      });
      const data = (await res.json()) as {
        intent?: "similar" | "answer";
        answer?: string;
        refinement_context?: string;
        error?: string;
      };

      if (data.intent === "similar" && data.refinement_context) {
        // "Find more like this" — run the full pipeline again, seeded
        // with the referenced card(s) as refinement context. Reuses
        // the existing priorContext mechanism; runKind: "refine" only
        // changes which step labels the agent-activity UI shows.
        const updatedHistory: ConversationTurn[] = [
          ...history,
          { role: "user", content: msg },
        ];
        const updatedSlots = {
          ...slots,
          description: `${slots.description} | Follow-up: ${msg}`,
        };
        setSlots(updatedSlots);
        await dispatchScout(
          updatedSlots,
          data.refinement_context,
          updatedHistory,
          "refine",
        );
      } else if (data.intent === "answer" && data.answer) {
        // Direct question about the referenced card — answer in chat,
        // no new run, cards on screen untouched.
        setTree((prevTree) => {
          return addMessage(prevTree, userNodeId, "assistant", data.answer!).tree;
        });
      } else {
        setTree((prevTree) => {
          return addMessage(
            prevTree,
            userNodeId,
            "assistant",
            data.error ??
            "Sorry, I couldn't work out how to respond to that — could you try rephrasing?",
          ).tree;
        });
      }
    } catch (err) {
      console.error("card-chat request failed:", err);
      setTree((prevTree) => {
        return addMessage(
          prevTree,
          userNodeId,
          "assistant",
          "Sorry, something went wrong answering that — please try again.",
        ).tree;
      });
    } finally {
      setIsClassifyingCardChat(false);
    }
  }

  const googleAvatar = user?.user_metadata?.avatar_url as string | undefined;
  const googleName = user?.user_metadata?.full_name as string | undefined;
  const headerAvatarUrl = profile?.avatar_url ?? googleAvatar;
  const headerDisplayName =
    profile?.display_name ?? localDisplayName ?? googleName ?? user?.email ?? "Account";
  const headerInitial = headerDisplayName.charAt(0).toUpperCase();


  return {
    // routing / identity
    router,
    chatId,
    // auth / account
    user,
    syncStatus,
    activeView,
    setActiveView,
    accountChats,
    refreshAccountChats,
    profile,
    refreshProfile,
    isGlowing,
    isDropdownOpen,
    setIsDropdownOpen,
    signInWithGoogle,
    signOut,
    // onboarding
    hasOnboarded,
    localDisplayName,
    completeOnboarding,
    setLocalDisplayName,
    effectiveDisplayName,
    canSend,
    // phase / conversation
    phase,
    setPhase,
    thinkingMessage,
    introText,
    setIntroText,
    userHasEdited,
    setUserHasEdited,
    tree,
    setTree,
    activePathNodes,
    history,
    slots,
    setSlots,
    title,
    setTitle,
    currentQuestion,
    setCurrentQuestion,
    showChatsList,
    setShowChatsList,
    showContinuityModal,
    setShowContinuityModal,
    shareCopied,
    shareDialog,
    setShareDialog,
    // runs / results panel
    runs,
    activeRunId,
    setActiveRunId,
    focusedRunId,
    setFocusedRunId,
    rightPanelRunId,
    setRightPanelRunId,
    inFlightRun,
    openRunCards,
    handlePillClick,
    isRetryingRunId,
    error,
    followUpText,
    setFollowUpText,
    isFollowingUp,
    attachedCard,
    setAttachedCard,
    isClassifyingCardChat,
    suggestionPrefill,
    landingSuggestions,
    typewriter,
    hasHydrated,
    hasStarted,
    // header-derived
    headerAvatarUrl,
    headerDisplayName,
    headerInitial,
    // handlers
    handleDeleteConfirmedOnCurrentChat,
    generateChatTitle,
    dispatchScout,
    handleRetryRun,
    askForNextQuestion,
    handleInitialSubmit,
    handleEditMessage,
    handleSwitchBranch,
    handleIntroSubmit,
    handleShareCurrentChat,
    handleCopyCurrentShareLink,
    handleAnswer,
    handleSkipAll,
    handleStop,
    handleNewChat,
    handleFollowUp,
    // refs (rarely needed by JSX, but kept for parity/edge cases)
    abortControllerRef,
    pollTimerRef,
    wasStoppedRef,
    stoppedDuringRef,
    lastScoutArgsRef,
    hydratedRef,
  };
}
