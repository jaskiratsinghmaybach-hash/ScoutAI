"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { compressToEncodedURIComponent } from "lz-string";
import { SuggestionPanel } from "@/components/scout/SuggestionPanel";
import { ViewToggle, RightPaneView } from "@/components/scout/ViewToggle";
import { Button } from "@/components/ui/button";
import { ArrowUp, Check, Copy } from "lucide-react";
import BorderGlow from "@/components/scout/BorderGlow";
import { QuestionCard } from "@/components/scout/QuestionCard";
import { AgentTrace } from "@/components/scout/AgentTrace";
import { ActivityPill } from "@/components/scout/ActivityPill";
import { LatestRunIndicator } from "@/components/scout/LatestRunIndicator";
import { LocationCard } from "@/components/scout/LocationCard";
import { SkeletonCard } from "@/components/scout/SkeletonCard";
import { UserMessage } from "@/components/scout/UserMessage";
import { ChatsList } from "@/components/scout/ChatsList";
import { useTypewriter } from "@/lib/useTypewriter";
import { AppHeader } from "@/components/scout/AppHeader";
import { ContinuityModal } from "@/components/scout/ContinuityModal";
import { getRandomSuggestions } from "@/data/suggestions";
import {
  saveChatState,
  loadChatState,
  listAllChats,
  generateChatId,
} from "@/lib/chatStorage";
import { upsertChat, fetchAccountChatState } from "@/lib/continuitySync";
import { useAuth } from "@/lib/useAuth";
import {
  createEmptyTree,
  addMessage,
  getActivePath,
  getSiblingInfo,
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
} from "@/types";

type Phase =
  | "intro"
  | "clarifying"
  | "thinking"
  | "running"
  | "stopped"
  | "done";

const EMPTY_SLOTS: SlotState = {
  description: "",
  mood: "",
  era: "",
  budget: "",
  region: "",
  duration: "",
  requirements: "",
};

// Shared BorderGlow styling — same look as the landing page input box,
// used everywhere (clarifying / thinking / running / stopped / done)
// instead of the old purple/green neon variant.
const GLOW_PROPS = {
  borderRadius: 30,
  glowRadius: 36,
  glowIntensity: 0.6,
  coneSpread: 30,
  edgeSensitivity: 25,
  backgroundColor: "#141414",
  colors: ["#ffffff", "#71717a", "#ffffff"] as string[],
  glowColor: "0 0% 95%",
} as const;

export function ScoutApp({ chatId }: { chatId?: string }) {
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
  const activeLeafId: string | null = activePathNodes.at(-1)?.id ?? null;

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
  const [rightPaneView, setRightPaneView] = useState<RightPaneView>("scout");
  const [error, setError] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const [isFollowingUp, setIsFollowingUp] = useState(false);
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
  const streamReaderRef =
    useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const wasStoppedRef = useRef(false);
  const stoppedDuringRef = useRef<"clarify" | "research">("clarify");
  const lastScoutArgsRef = useRef<{
    finalSlots: SlotState;
    priorContext?: string;
  }>({ finalSlots: EMPTY_SLOTS });
  const hasStarted = phase !== "intro";
  const hydratedRef = useRef(false);

  // askForNextQuestion is defined further down in the component (it's
  // large and depends on several handlers below it). The hydration
  // effect needs to call it on mount, before its declaration would be
  // reached in source order. A function declaration IS hoisted and this
  // is safe at runtime (the effect only fires after the component body
  // finishes evaluating once), but react-hooks/immutability can't prove
  // that statically. Routing the call through a ref — updated via a
  // plain assignment in an effect after askForNextQuestion is declared —
  // gives the linter a pattern it can verify, and also protects against
  // any future refactor accidentally introducing real staleness here.
  const askForNextQuestionRef = useRef<
    ((history: ConversationTurn[], slots: SlotState) => Promise<void>) | null
  >(null);

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
      let stored: ReturnType<typeof loadChatState> = null;

      if (activeView === "account") {
        if (user) {
          stored = await fetchAccountChatState(user.id, id);
        } else {
          stored = null;
        }
      } else {
        // activeView === "local": existing localStorage loader untouched
        stored = loadChatState(id);
      }

      if (isCancelled) return;
      hydratedRef.current = true;

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
        setIntroText("");
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

      if (stored.runs?.some((r) => r.packet)) {
        setPhase("done");
      } else if (
        stored.history.length === 1 &&
        stored.history[0].role === "user"
      ) {
        askForNextQuestionRef.current?.(stored.history, stored.slots);
      } else if (stored.history.length > 0) {
        setPhase("clarifying");
      }
    }

    loadState(targetId);

    return () => {
      isCancelled = true;
    };
  }, [chatId, activeView, user]);

  function handleInitialSubmit(textToSubmit?: string) {
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

  async function askForNextQuestion(
    updatedHistory: ConversationTurn[],
    updatedSlots: SlotState,
  ) {
    setError(null);
    wasStoppedRef.current = false;
    stoppedDuringRef.current = "clarify";
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
        // Small talk / greeting: reply in character and go back to
        // waiting for the next message — never launch the scout pipeline.
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
  }

  // Keep the ref pointed at the latest askForNextQuestion so the
  // hydration effect above (which runs before this declaration in
  // source order) always calls a fresh, non-stale version.
  useEffect(() => {
    askForNextQuestionRef.current = askForNextQuestion;
  });

  /**
   * Edits a past user message at the given history index. Today this is
   * non-branching: everything after that message is discarded and the
   * conversation re-runs from the edited point, exactly like a fresh
   * follow-up. Slots are reset and re-derived by the model from the
   * truncated history, since we don't keep per-turn slot snapshots.
   *
   * TODO (#4): replace this with real branching — keep the discarded
   * tail as an inactive branch instead of deleting it, and add the
   * ChatGPT-style "1/2 <>" pager to switch between versions.
   */
  function handleEditMessage(index: number, newContent: string) {
    // Abort anything in flight from the old branch before starting fresh
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (streamReaderRef.current) {
      streamReaderRef.current.cancel().catch(() => {});
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
    if (streamReaderRef.current) {
      streamReaderRef.current.cancel().catch(() => {});
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
    if (submittedText.length < 5) return;

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

  async function generateChatTitle(
    finalSlots: SlotState,
    currentHistory: ConversationTurn[],
  ) {
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
  }

  function handleAnswer(answer: string) {
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
    if (history.length === 0) return;
    dispatchScout(slots);
  }

  async function dispatchScout(
    finalSlots: SlotState,
    prompt?: string,
    historyContext?: ConversationTurn[],
  ) {
    setPhase("running");
    setError(null);
    wasStoppedRef.current = false;
    stoppedDuringRef.current = "research";

    lastScoutArgsRef.current = { finalSlots, priorContext: prompt };

    const runId = generateChatId();
    const isFirstRun = runs.length === 0;
    const activeHistory = historyContext || history;
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
    };

    setRuns((prev) => [...prev, initialRun]);
    setActiveRunId(runId);

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

      if (!res.ok || !res.body) {
        throw new Error("Failed to connect to scout stream");
      }

      const reader = res.body.getReader();
      streamReaderRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "step") {
              setRuns((prev) =>
                prev.map((r) => {
                  if (r.id !== runId) return r;
                  const existingIndex = r.steps.findIndex(
                    (s) => s.step === event.step.step,
                  );
                  const newSteps = [...r.steps];
                  if (existingIndex >= 0) {
                    newSteps[existingIndex] = event.step;
                  } else {
                    newSteps.push(event.step);
                  }
                  return { ...r, steps: newSteps };
                }),
              );
            } else if (event.type === "complete" || event.type === "result") {
              setRuns((prev) =>
                prev.map((r) => {
                  if (r.id !== runId) return r;
                  const finishedSteps = r.steps.map((s) => ({
                    ...s,
                    status:
                      s.status === "running" ? ("done" as const) : s.status,
                  }));
                  return { ...r, steps: finishedSteps, packet: event.packet };
                }),
              );
              setPhase("done");

              // Generate AI title only on the FIRST completed run, and only if not already custom-renamed
              if (isFirstRun) {
                generateChatTitle(finalSlots, activeHistory);
              }
            } else if (event.type === "error") {
              setError(event.error);
              setPhase("clarifying");
            }
          } catch (e) {
            console.error("Failed to parse SSE line:", e);
          }
        }
      }
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
      streamReaderRef.current = null;
    }
  }

  function handleStop() {
    wasStoppedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (streamReaderRef.current) {
      streamReaderRef.current.cancel().catch(() => {});
    }
    setPhase("stopped");
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

  function handleFollowUp(e: React.FormEvent) {
    e.preventDefault();
    const msg = followUpText.trim();
    if (!msg) return;

    setFollowUpText("");
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
  }

  const googleAvatar = user?.user_metadata?.avatar_url as string | undefined;
  const googleName = user?.user_metadata?.full_name as string | undefined;
  const headerAvatarUrl = profile?.avatar_url ?? googleAvatar;
  const headerDisplayName =
    profile?.display_name ?? googleName ?? user?.email ?? "Account";
  const headerInitial = headerDisplayName.charAt(0).toUpperCase();

  // ---------- INTRO / LANDING VIEW ----------
  if (!hasStarted && history.length === 0) {
    return (
      <main className="flex h-screen w-full overflow-hidden">
        {/* Inline collapsible chats column — matches the main chat view's
            pattern instead of the old full-screen overlay drawer. */}
        <div
          className={`flex h-full flex-col border-r border-border transition-all duration-200 ${
            showChatsList ? "w-full max-w-sm" : "w-0 overflow-hidden border-r-0"
          }`}
        >
          {showChatsList && (
            <ChatsList
              onClose={() => setShowChatsList(false)}
              activeView={activeView}
              user={user}
              accountChats={accountChats}
              onRefreshAccountChats={refreshAccountChats}
              onSignIn={() => {
                setShowChatsList(false);
                signInWithGoogle();
              }}
              onSwitchToLocal={() => setActiveView("local")}
              currentChatId={chatId}
              onDeleteConfirmedOnCurrentChat={handleDeleteConfirmedOnCurrentChat}
            />
          )}
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4">
          {/* Upper Left: Chats toggle button — only shown when the column
              is collapsed, so there's always a way to reopen it */}
          {!showChatsList && (
            <div className="absolute left-6 top-6 z-20">
              <button
                type="button"
                onClick={() => setShowChatsList(true)}
                className="group inline-flex items-center gap-1 font-display rounded-full bg-neutral-800/60 px-3 py-1.5 text-xs font-medium text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
              >
                <svg
                  className="h-3.5 w-3.5 text-neutral-400 transition-colors group-hover:text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span>Chats</span>
              </button>
            </div>
          )}

        {/* Upper Right: Continuity Button */}
        <div className="absolute right-6 top-6 z-20">
          <button
            type="button"
            id="continuity-btn-landing"
            onClick={() => setShowContinuityModal(true)}
            className={`relative flex items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 active:scale-95 ${
              user
                ? "h-8 w-8"
                : "px-3 py-1.5 text-xs font-medium bg-neutral-800/60 text-neutral-300 hover:bg-neutral-800 hover:text-white"
            } ${
              isGlowing
                ? "ring-2 ring-amber-400/90 shadow-[0_0_15px_rgba(251,191,36,0.6)] animate-pulse"
                : user
                  ? "ring-1 ring-border hover:ring-border-strong"
                  : ""
            }`}
          >
            {user ? (
              <>
                {headerAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={headerAvatarUrl}
                    alt={headerDisplayName}
                    className="h-full w-full rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white">
                    {headerInitial}
                  </div>
                )}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                    syncStatus === "synced"
                      ? "bg-emerald-400"
                      : syncStatus === "syncing"
                        ? "bg-amber-400 animate-pulse"
                        : syncStatus === "pending"
                          ? "bg-orange-400"
                          : "bg-neutral-500"
                  }`}
                />
              </>
            ) : (
              "Continuity"
            )}
          </button>
        </div>

        {/* Continuity Modal (landing view) */}
        {showContinuityModal && (
          <ContinuityModal
            onClose={() => {
              setShowContinuityModal(false);
              setIsDropdownOpen(false);
            }}
            user={user}
            syncStatus={syncStatus}
            activeView={activeView}
            onSelectView={(v) => setActiveView(v)}
            localChatCount={listAllChats().length}
            accountChatCount={accountChats.length}
            onSignIn={() => {
              setShowContinuityModal(false);
              setIsDropdownOpen(false);
              signInWithGoogle();
            }}
            onSignOut={() => {
              setShowContinuityModal(false);
              setIsDropdownOpen(false);
              signOut();
            }}
            onRefreshAccountChats={refreshAccountChats}
            onDeleteConfirmedOnCurrentChat={handleDeleteConfirmedOnCurrentChat}
            profile={profile}
            onRefreshProfile={refreshProfile}
          />
        )}

        <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.avif"
              alt="ScoutAI"
              width={160}
              height={80}
              priority
              className="h-10 w-auto object-contain"
            />
          </div>

          <p className="mt-2 text-sm text-foreground-muted">
            Autonomous location scouting for film &amp; commercial productions.
          </p>

          <BorderGlow className="mt-6 w-full" {...GLOW_PROPS}>
            <form
              onSubmit={handleIntroSubmit}
              className="flex items-center gap-3 p-2.5 pl-4 pr-3"
            >
              <input
                value={
                  userHasEdited
                    ? introText
                    : introText || typewriter.displayText
                }
                onChange={(e) => {
                  setUserHasEdited(true);
                  if (!typewriter.isFrozen) typewriter.freeze(e.target.value);
                  setIntroText(e.target.value);
                }}
                onMouseDown={() => {
                  if (!userHasEdited) {
                    const current = typewriter.displayText;
                    setUserHasEdited(true);
                    setIntroText(current);
                    typewriter.freeze(current);
                  }
                }}
                onFocus={() => {
                  if (!userHasEdited) {
                    const current = typewriter.displayText;
                    setUserHasEdited(true);
                    setIntroText(current);
                    typewriter.freeze(current);
                  }
                }}
                placeholder={
                  userHasEdited ? "Describe the scene you're scouting..." : ""
                }
                autoFocus
                className={`h-12 flex-1 border-0 bg-transparent px-3 text-base transition-colors duration-300 placeholder:text-neutral-500 focus-visible:ring-0 focus:outline-none ${
                  (userHasEdited
                    ? introText
                    : introText || typewriter.displayText) ||
                  typewriter.isFrozen
                    ? "text-white"
                    : "text-white/85"
                }`}
              />
              <Button
                type="submit"
                disabled={
                  (userHasEdited
                    ? introText
                    : introText || typewriter.displayText
                  ).trim().length < 5
                }
                className="h-10 w-10 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
              >
                <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
              </Button>
            </form>
          </BorderGlow>

          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {landingSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  typewriter.freeze(s);
                  setIntroText(s);
                  setUserHasEdited(true);
                }}
                className="rounded-full bg-neutral-800/60 px-3 py-1.5 text-xs text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:text-white active:scale-95"
              >
                {s.length > 40 ? s.slice(0, 40) + "…" : s}
              </button>
            ))}
          </div>
        </div>
      </div>
      </main>
    );
  }

  // Which run (if any) is "in progress and not the one currently shown" —
  // drives the LatestRunIndicator, and must live directly above whichever
  // input box is actually rendered, never as a floating sibling.
  const latestRun = runs[runs.length - 1];
  const showLatestIndicator =
    Boolean(latestRun) && latestRun.id !== activeRunId;

  // ---------- CONVERSATION VIEW ----------
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="relative z-50">
        <AppHeader
          title={title}
          actions={
            <>
              <button
                type="button"
                id="continuity-btn-header"
                onClick={() => setShowContinuityModal(true)}
                className={`relative flex items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 active:scale-95 ${
                  user
                    ? "h-8 w-8"
                    : "px-3 py-1.5 text-[13px] font-medium bg-neutral-800/60 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                } ${
                  isGlowing
                    ? "ring-2 ring-amber-400/90 shadow-[0_0_15px_rgba(251,191,36,0.6)] animate-pulse"
                    : user
                      ? "ring-1 ring-border hover:ring-border-strong"
                      : ""
                }`}
              >
                {user ? (
                  <>
                    {headerAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={headerAvatarUrl}
                        alt={headerDisplayName}
                        className="h-full w-full rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white">
                        {headerInitial}
                      </div>
                    )}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                        syncStatus === "synced"
                          ? "bg-emerald-400"
                          : syncStatus === "syncing"
                            ? "bg-amber-400 animate-pulse"
                            : syncStatus === "pending"
                              ? "bg-orange-400"
                              : "bg-neutral-500"
                      }`}
                    />
                  </>
                ) : (
                  "Continuity"
                )}
              </button>
              <button
                type="button"
                onClick={handleShareCurrentChat}
                className="rounded-full bg-neutral-800/60 px-3 py-1.5 text-[13px] font-medium text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
              >
                Share
              </button>
            </>
          }
        />

        {/* Continuity Modal (conversation view) */}
        {showContinuityModal && (
          <ContinuityModal
            onClose={() => {
              setShowContinuityModal(false);
              setIsDropdownOpen(false);
            }}
            user={user}
            syncStatus={syncStatus}
            activeView={activeView}
            onSelectView={(v) => setActiveView(v)}
            localChatCount={listAllChats().length}
            accountChatCount={accountChats.length}
            onSignIn={() => {
              setShowContinuityModal(false);
              setIsDropdownOpen(false);
              signInWithGoogle();
            }}
            onSignOut={() => {
              setShowContinuityModal(false);
              setIsDropdownOpen(false);
              signOut();
            }}
            onRefreshAccountChats={refreshAccountChats}
            onDeleteConfirmedOnCurrentChat={handleDeleteConfirmedOnCurrentChat}
            profile={profile}
            onRefreshProfile={refreshProfile}
          />
        )}
      </div>

      {shareDialog && (
        <div
          onClick={() => setShareDialog(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-border bg-surface-raised p-6 shadow-2xl space-y-5"
          >
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Share chat
              </div>
              <h3 className="truncate text-base font-semibold text-foreground">
                {shareDialog.title}
              </h3>
            </div>

            <div className="rounded-lg border border-border bg-black/30 p-3.5">
              <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Viewer access
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-300">
                Anyone with this link can view this shared ScoutAI chat and its
                scouting results.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Share link
              </label>
              <div className="flex h-11 items-center rounded-lg border border-border bg-surface px-3 focus-within:border-border-strong">
                <input
                  readOnly
                  value={shareDialog.url}
                  className="selectable min-w-0 flex-1 bg-transparent pr-3 text-sm text-neutral-300 outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={handleCopyCurrentShareLink}
                  aria-label="Copy share link"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800/60 text-neutral-300 transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                >
                  {shareCopied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShareDialog(null)}
                className="rounded-full bg-neutral-800/60 px-4 py-1.5 text-sm text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        <div className="flex w-full max-w-md flex-col border-r border-border">
          <div className="flex flex-1 flex-col overflow-hidden">
            {showChatsList ? (
              <ChatsList
                onClose={() => setShowChatsList(false)}
                activeView={activeView}
                user={user}
                accountChats={accountChats}
                onRefreshAccountChats={refreshAccountChats}
                onSignIn={() => {
                  setShowChatsList(false);
                  signInWithGoogle();
                }}
                onSwitchToLocal={() => setActiveView("local")}
                currentChatId={chatId}
                onDeleteConfirmedOnCurrentChat={
                  handleDeleteConfirmedOnCurrentChat
                }
              />
            ) : (
              <>
                <div className="sticky top-0 z-10 flex w-full items-center justify-center gap-2 px-4 py-2">
                  {/* Chats Button */}
                  <button
                    type="button"
                    onClick={() => setShowChatsList(true)}
                    className="group inline-flex items-center gap-0.5 font-display rounded-full bg-neutral-800/60 px-3 py-1.5 text-[15px] font-medium text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                  >
                    {/* Chat Bubble Icon */}
                    <svg
                      className="h-6 w-8 text-neutral-400 transition-colors group-hover:text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    <span>Chats</span>
                  </button>

                  {/* New Chat (+) Button */}
                  <div className="relative group/newchat">
                    <button
                      type="button"
                      onClick={handleNewChat}
                      aria-label="New chat"
                      className="group flex h-[35px] w-[35px] items-center justify-center rounded-full bg-neutral-800/60 text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                    >
                      <svg
                        className="h-4 w-4 text-neutral-400 transition-colors group-hover:text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                    </button>

                    {/* Tooltip: hidden by default, fades in on hover, doesn't block clicks */}
                    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-800 px-2 py-1 text-[11px] font-medium text-neutral-200 opacity-0 shadow-lg transition-opacity duration-150 group-hover/newchat:opacity-100">
                      New chat
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
                  {/* Merged message and activity stream */}
                  {activePathNodes.map((node, i) => {
                    const run = runs.find(
                      (r) =>
                        r.triggerMessageIndex === i &&
                        r.triggerMessageContent === node.content,
                    );
                    const isLatestRun =
                      run && run.id === runs[runs.length - 1]?.id;
                    const isActive = run ? activeRunId === run.id : false;

                    const siblingInfo = getSiblingInfo(tree, node.id);
                    const hasSiblings = Boolean(
                      siblingInfo && siblingInfo.total > 1,
                    );

                    return (
                      <div key={node.id} className="space-y-4">
                        {node.role === "user" ? (
                          <UserMessage
                            content={node.content}
                            onEdit={(newContent) =>
                              handleEditMessage(i, newContent)
                            }
                            pager={
                              hasSiblings && siblingInfo
                                ? {
                                    position: siblingInfo.position,
                                    total: siblingInfo.total,
                                    onNavigate: (direction) => {
                                      const parentId =
                                        node.parentId ?? tree.rootId;
                                      const currentIndex =
                                        siblingInfo.position - 1;
                                      const targetIndex =
                                        direction === "prev"
                                          ? currentIndex - 1
                                          : currentIndex + 1;
                                      const targetSibling =
                                        siblingInfo.siblings[targetIndex];
                                      if (!targetSibling) return;
                                      handleSwitchBranch(
                                        parentId,
                                        targetSibling.id,
                                      );
                                    },
                                  }
                                : undefined
                            }
                          />
                        ) : (
                          <div className="max-w-[90%] text-sm leading-relaxed text-foreground-muted">
                            {node.content}
                          </div>
                        )}

                        {run &&
                          (isLatestRun &&
                          (phase === "running" || phase === "thinking") &&
                          !run.packet ? (
                            <AgentTrace key={run.id} steps={run.steps} />
                          ) : (
                            <div key={run.id} className="space-y-2">
                              <ActivityPill
                                run={run}
                                isActive={isActive}
                                onClick={() => setActiveRunId(run.id)}
                              />

                              {run.packet && (
                                <div className="rounded-lg border border-border bg-surface p-3.5">
                                  <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                                    Scout&apos;s note
                                  </div>
                                  <div className="mt-2 space-y-1.5 text-xs">
                                    {run.packet.agent_reasoning
                                      .split("\n")
                                      .filter(Boolean)
                                      .map((line: string, li: number) => {
                                        const trimmed = line.trim();
                                        const isBullet =
                                          trimmed.startsWith("-") ||
                                          trimmed.startsWith("•");
                                        return isBullet ? (
                                          <div
                                            key={li}
                                            className="flex items-start gap-2 leading-relaxed text-foreground-muted"
                                          >
                                            <span className="select-none text-foreground-muted/60">
                                              •
                                            </span>
                                            <span>
                                              {trimmed.replace(/^[-•]\s*/, "")}
                                            </span>
                                          </div>
                                        ) : (
                                          <p
                                            key={li}
                                            className="mb-2.5 font-medium leading-relaxed text-foreground"
                                          >
                                            {trimmed}
                                          </p>
                                        );
                                      })}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    );
                  })}

                  {phase === "thinking" &&
                    !runs.some(
                      (r) => r.triggerMessageIndex === history.length - 1,
                    ) && (
                      <div className="flex items-center gap-2 text-xs text-foreground-muted">
                        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                        ScoutAI is thinking...
                      </div>
                    )}

                  {error && (
                    <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                      {error}
                    </div>
                  )}
                </div>

                {/* ---- Input area: exactly one block renders at a time, and the
              LatestRunIndicator (if needed) always sits directly above it. ---- */}

                {/* Fresh chat input bar when history is empty */}
                {history.length === 0 &&
                  (phase === "intro" || phase === "clarifying") && (
                    <div className="shrink-0">
                      <div className="px-6 pb-6 pt-2">
                        <BorderGlow {...GLOW_PROPS}>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleInitialSubmit();
                            }}
                            className="flex items-center gap-2 p-2.5"
                          >
                            <input
                              value={followUpText || introText}
                              onChange={(e) => {
                                setFollowUpText(e.target.value);
                                setIntroText(e.target.value);
                              }}
                              placeholder="Describe the scene you're scouting..."
                              autoFocus
                              className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none"
                            />
                            <Button
                              type="submit"
                              disabled={
                                (followUpText || introText).trim().length < 3
                              }
                              className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                            >
                              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                            </Button>
                          </form>
                        </BorderGlow>
                      </div>
                    </div>
                  )}

                {history.length > 0 &&
                  (phase === "clarifying" ||
                    phase === "thinking" ||
                    phase === "running") && (
                    <div className="shrink-0">
                      {showLatestIndicator && (
                        <LatestRunIndicator
                          latestRun={latestRun}
                          isViewingLatest={false}
                          onJumpToLatest={() => setActiveRunId(latestRun.id)}
                        />
                      )}
                      <div className="px-6 pb-6 pt-2 space-y-3">
                        {phase === "clarifying" && currentQuestion ? (
                          currentQuestion.type === "choice" ? (
                            <>
                              <QuestionCard
                                key={currentQuestion.text}
                                question={currentQuestion}
                                onAnswer={handleAnswer}
                                onSkipAll={handleSkipAll}
                                prefill={suggestionPrefill}
                              />
                              <BorderGlow {...GLOW_PROPS}>
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (followUpText.trim().length === 0)
                                      return;
                                    const message = followUpText.trim();
                                    setFollowUpText("");
                                    handleAnswer(message);
                                  }}
                                  className="flex items-center gap-2 p-2.5"
                                >
                                  <input
                                    value={followUpText}
                                    onChange={(e) =>
                                      setFollowUpText(e.target.value)
                                    }
                                    placeholder="Or type your own answer..."
                                    className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none"
                                  />
                                  <Button
                                    type="submit"
                                    disabled={followUpText.trim().length === 0}
                                    className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                                  >
                                    <ArrowUp
                                      className="h-4 w-4"
                                      strokeWidth={2.5}
                                    />
                                  </Button>
                                </form>
                              </BorderGlow>
                            </>
                          ) : (
                            <QuestionCard
                              key={currentQuestion.text}
                              question={currentQuestion}
                              onAnswer={handleAnswer}
                              onSkipAll={handleSkipAll}
                              prefill={suggestionPrefill}
                            />
                          )
                        ) : phase === "clarifying" ? (
                          // Chat-only turn (greeting/small talk reply) — no
                          // question pending, just let the user keep talking.
                          <BorderGlow {...GLOW_PROPS}>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const message = followUpText.trim();
                                if (!message) return;
                                setFollowUpText("");
                                const updatedHistory: ConversationTurn[] = [
                                  ...history,
                                  { role: "user", content: message },
                                ];
                                setTree((prevTree) => {
                                  const leafId =
                                    getActivePath(prevTree).at(-1)?.id ??
                                    null;
                                  return addMessage(
                                    prevTree,
                                    leafId,
                                    "user",
                                    message,
                                  ).tree;
                                });
                                askForNextQuestion(updatedHistory, slots);
                              }}
                              className="flex items-center gap-2 p-2.5"
                            >
                              <input
                                value={followUpText}
                                onChange={(e) =>
                                  setFollowUpText(e.target.value)
                                }
                                placeholder="Type a message..."
                                autoFocus
                                className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none"
                              />
                              <Button
                                type="submit"
                                disabled={followUpText.trim().length === 0}
                                className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                              >
                                <ArrowUp
                                  className="h-4 w-4"
                                  strokeWidth={2.5}
                                />
                              </Button>
                            </form>
                          </BorderGlow>
                        ) : (
                          <BorderGlow {...GLOW_PROPS}>
                            <div className="flex items-center gap-2 p-2.5">
                              <div className="h-10 flex-1 rounded-lg bg-transparent px-2 text-sm text-foreground-muted flex items-center">
                                {phase === "thinking"
                                  ? "ScoutAI is thinking..."
                                  : "Researching locations..."}
                              </div>
                              <button
                                type="button"
                                onClick={handleStop}
                                aria-label="Stop"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised hover:bg-surface-raised/70 transition-colors"
                              >
                                <div className="h-3 w-3 rounded-[3px] bg-white" />
                              </button>
                            </div>
                          </BorderGlow>
                        )}
                      </div>
                    </div>
                  )}

                {phase === "stopped" && (
                  <div className="shrink-0">
                    {showLatestIndicator && (
                      <LatestRunIndicator
                        latestRun={latestRun}
                        isViewingLatest={false}
                        onJumpToLatest={() => setActiveRunId(latestRun.id)}
                      />
                    )}
                    <div className="px-6 pb-6 pt-2">
                      <BorderGlow {...GLOW_PROPS}>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (followUpText.trim().length === 0) return;
                            const message = followUpText.trim();
                            setFollowUpText("");

                            if (stoppedDuringRef.current === "research") {
                              const updatedHistory: ConversationTurn[] = [
                                ...history,
                                { role: "user", content: message },
                              ];
                              setTree((prevTree) => {
                                const leafId =
                                  getActivePath(prevTree).at(-1)?.id ?? null;
                                return addMessage(
                                  prevTree,
                                  leafId,
                                  "user",
                                  message,
                                ).tree;
                              });
                              dispatchScout(
                                lastScoutArgsRef.current.finalSlots,
                                message,
                                updatedHistory,
                              );
                            } else {
                              const updatedHistory: ConversationTurn[] = [
                                ...history,
                                { role: "user", content: message },
                              ];
                              setTree((prevTree) => {
                                const leafId =
                                  getActivePath(prevTree).at(-1)?.id ?? null;
                                return addMessage(
                                  prevTree,
                                  leafId,
                                  "user",
                                  message,
                                ).tree;
                              });
                              askForNextQuestion(updatedHistory, slots);
                            }
                          }}
                          className="flex items-center gap-2 p-2.5"
                        >
                          <input
                            value={followUpText}
                            onChange={(e) => setFollowUpText(e.target.value)}
                            placeholder="Type a message to continue..."
                            autoFocus
                            className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none"
                          />
                          <Button
                            type="submit"
                            disabled={followUpText.trim().length === 0}
                            className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                          >
                            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                          </Button>
                        </form>
                      </BorderGlow>
                    </div>
                  </div>
                )}

                {phase === "done" && latestRun?.packet && (
                  <div className="shrink-0">
                    {showLatestIndicator && (
                      <LatestRunIndicator
                        latestRun={latestRun}
                        isViewingLatest={false}
                        onJumpToLatest={() => setActiveRunId(latestRun.id)}
                      />
                    )}
                    <div className="px-6 pb-6 pt-2">
                      <BorderGlow {...GLOW_PROPS}>
                        <form
                          onSubmit={handleFollowUp}
                          className="flex items-center gap-2 p-2.5"
                        >
                          <input
                            value={followUpText}
                            onChange={(e) => setFollowUpText(e.target.value)}
                            placeholder="Refine — 'cheaper options'..."
                            disabled={isFollowingUp}
                            className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:opacity-50"
                          />
                          <Button
                            type="submit"
                            disabled={
                              followUpText.trim().length === 0 || isFollowingUp
                            }
                            className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                          >
                            {isFollowingUp ? (
                              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" />
                            ) : (
                              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                            )}
                          </Button>
                        </form>
                      </BorderGlow>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="mb-6 flex justify-center">
            <ViewToggle value={rightPaneView} onChange={setRightPaneView} />
          </div>

          {rightPaneView === "scout" ? (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center text-sm text-neutral-500">
              <p className="max-w-xs">
                The interactive Scout map view is coming soon — this is
                where you&apos;ll explore locations visually as you describe
                your scene.
              </p>
            </div>
          ) : (
            (() => {
              const active = runs.find((r) => r.id === activeRunId);

              if (!active) {
                return phase !== "thinking" && phase !== "running" ? (
                  <SuggestionPanel
                    onSelect={(text) => {
                      if (
                        phase === "clarifying" &&
                        currentQuestion?.type === "text"
                      ) {
                        setSuggestionPrefill(text);
                      } else if (phase === "stopped") {
                        setFollowUpText(text);
                      } else if (history.length === 0) {
                        setFollowUpText(text);
                        setIntroText(text);
                      } else {
                        setFollowUpText(text);
                      }
                    }}
                  />
                ) : null;
              }

              if (!active.packet) {
                return (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {active.packet.locations.map((loc, i) => (
                    <div
                      key={loc.id}
                      className="max-h-[calc(100vh-4rem)] overflow-y-auto"
                    >
                      <LocationCard location={loc} rank={i + 1} />
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>
      </main>
    </div>
  );
}