"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { compressToEncodedURIComponent } from "lz-string";
import { SuggestionPanel } from "@/components/scout/SuggestionPanel";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";
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
import { getRandomSuggestions } from "@/data/suggestions";
import { saveChatState, loadChatState, generateChatId } from "@/lib/chatStorage";
import type {
    SlotState,
    ClarifyQuestion,
    ConversationTurn,
    ScoutRun,
} from "@/types";

type Phase = "intro" | "clarifying" | "thinking" | "running" | "stopped" | "done";

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
    const [phase, setPhase] = useState<Phase>("intro");
    const [introText, setIntroText] = useState("");
    const [userHasEdited, setUserHasEdited] = useState(false);
    const [history, setHistory] = useState<ConversationTurn[]>([]);
    const [slots, setSlots] = useState<SlotState>(EMPTY_SLOTS);
    const [title, setTitle] = useState<string | undefined>(undefined);
    const [currentQuestion, setCurrentQuestion] = useState<ClarifyQuestion | null>(null);
    const [showChatsList, setShowChatsList] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);

    const [runs, setRuns] = useState<ScoutRun[]>([]);
    const [activeRunId, setActiveRunId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [followUpText, setFollowUpText] = useState("");
    const [isFollowingUp, setIsFollowingUp] = useState(false);
    const [suggestionPrefill, setSuggestionPrefill] = useState<string | undefined>(undefined);
    const [landingSuggestions, setLandingSuggestions] = useState<string[]>([]);
    useEffect(() => {
        const suggestionsTimer = window.setTimeout(() => {
            setLandingSuggestions(getRandomSuggestions(3));
        }, 0);

        return () => window.clearTimeout(suggestionsTimer);
    }, []);
    const typewriter = useTypewriter(landingSuggestions, { typeSpeed: 45, dwellMs: 2200 });

    const abortControllerRef = useRef<AbortController | null>(null);
    const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
    const wasStoppedRef = useRef(false);
    const stoppedDuringRef = useRef<"clarify" | "research">("clarify");
    const lastScoutArgsRef = useRef<{ finalSlots: SlotState; priorContext?: string }>({ finalSlots: EMPTY_SLOTS });
    const hasStarted = phase !== "intro";
    const hydratedRef = useRef(false);

    // Hydrate from localStorage if we're on a /chat/[id] route
    useEffect(() => {
        if (!chatId) return;

        const hydrationTimer = window.setTimeout(() => {
            const stored = loadChatState(chatId);
            hydratedRef.current = true;
            if (!stored || !stored.history || stored.history.length === 0) {
                setHistory([]);
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

            setHistory(stored.history);
            setSlots(stored.slots);
            setRuns(stored.runs ?? []);
            setTitle(stored.title ?? stored.history.find((h) => h.role === "user")?.content.slice(0, 40));
            setActiveRunId(stored.runs?.length ? stored.runs[stored.runs.length - 1].id : null);

            if (stored.runs?.some((r) => r.packet)) {
                setPhase("done");
            } else if (stored.history.length === 1 && stored.history[0].role === "user") {
                askForNextQuestion(stored.history, stored.slots);
            } else if (stored.history.length > 0) {
                setPhase("clarifying");
            }
        }, 0);

        return () => window.clearTimeout(hydrationTimer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatId]);

    function handleInitialSubmit(textToSubmit?: string) {
        const message = (textToSubmit || followUpText || introText).trim();
        if (message.length < 3) return;
        setFollowUpText("");
        setIntroText("");
        const newHistory: ConversationTurn[] = [{ role: "user", content: message }];
        const newSlots = { ...EMPTY_SLOTS, description: message };
        setTitle(message.slice(0, 40));
        setHistory(newHistory);
        setSlots(newSlots);
        askForNextQuestion(newHistory, newSlots);
    }

    // Persist to localStorage only when there is actual conversation history
    useEffect(() => {
        if (!chatId || !hydratedRef.current || history.length === 0) return;
        saveChatState(chatId, { history, slots, runs, title });
    }, [chatId, history, slots, runs, title]);

    async function askForNextQuestion(updatedHistory: ConversationTurn[], updatedSlots: SlotState) {
        setPhase("thinking");
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

            if (data.next_question) {
                setCurrentQuestion(data.next_question);
                setHistory([...updatedHistory, { role: "assistant", content: data.next_question.text }]);
                setPhase("clarifying");
            } else {
                dispatchScout(mergedSlots, undefined, updatedHistory);
            }
        } catch (err) {
            if (wasStoppedRef.current || (err instanceof DOMException && err.name === "AbortError")) {
                setPhase("stopped");
                return;
            }
            setError(err instanceof Error ? err.message : "Failed to continue conversation");
            setPhase("clarifying");
        } finally {
            abortControllerRef.current = null;
        }
    }

    function handleIntroSubmit(e: React.FormEvent) {
        e.preventDefault();
        const submittedText = (userHasEdited ? introText : (introText || typewriter.displayText)).trim();
        if (submittedText.length < 5) return;

        const newHistory: ConversationTurn[] = [{ role: "user", content: submittedText }];
        const newSlots = { ...EMPTY_SLOTS, description: submittedText };
        const initialTitle = submittedText.slice(0, 40);

        if (!chatId) {
            const newId = generateChatId();
            saveChatState(newId, {
                history: newHistory,
                slots: newSlots,
                runs: [],
                title: initialTitle,
            });
            router.push(`/chat/${newId}`);
            return;
        }

        setTitle(initialTitle);
        setHistory(newHistory);
        setSlots(newSlots);
        askForNextQuestion(newHistory, newSlots);
    }

    const handleShareCurrentChat = async () => {
        const payload = {
            history,
            slots,
            runs,
            title,
        };
        if (!payload.history || payload.history.length === 0) return;

        try {
            const compressed = compressToEncodedURIComponent(JSON.stringify(payload));
            const shareUrl = `${window.location.origin}/share/${compressed}`;
            await navigator.clipboard.writeText(shareUrl);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 1500);
        } catch (err) {
            console.error("Failed to copy share link:", err);
        }
    };

    function handleAnswer(answer: string) {
        if (!currentQuestion) return;
        const updatedSlots = { ...slots, [currentQuestion.slot]: answer };
        const updatedHistory: ConversationTurn[] = [...history, { role: "user", content: answer }];
        setHistory(updatedHistory);
        setSlots(updatedSlots);
        setCurrentQuestion(null);
        setSuggestionPrefill(undefined);
        askForNextQuestion(updatedHistory, updatedSlots);
    }

    function handleSkipAll() {
        if (history.length === 0) return;
        dispatchScout(slots);
    }

    async function dispatchScout(finalSlots: SlotState, prompt?: string, historyContext?: ConversationTurn[]) {
        setPhase("running");
        setError(null);
        wasStoppedRef.current = false;
        stoppedDuringRef.current = "research";

        lastScoutArgsRef.current = { finalSlots, priorContext: prompt };

        const runId = generateChatId();
        const activeHistory = historyContext || history;
        const lastTurn = activeHistory[activeHistory.length - 1];

        const initialRun: ScoutRun = {
            id: runId,
            steps: [
                {
                    step: 1,
                    action: "Synthesizing requirements",
                    detail: prompt ? `Refining scene: "${prompt}"` : "Converting brief to scene profile",
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
                body: JSON.stringify({ slots: finalSlots, prompt, history: activeHistory }),
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
                                    const existingIndex = r.steps.findIndex((s) => s.step === event.step.step);
                                    const newSteps = [...r.steps];
                                    if (existingIndex >= 0) {
                                        newSteps[existingIndex] = event.step;
                                    } else {
                                        newSteps.push(event.step);
                                    }
                                    return { ...r, steps: newSteps };
                                })
                            );
                        } else if (event.type === "result") {
                            setRuns((prev) =>
                                prev.map((r) => {
                                    if (r.id !== runId) return r;
                                    const finishedSteps = r.steps.map((s) => ({
                                        ...s,
                                        status: s.status === "running" ? ("done" as const) : s.status,
                                    }));
                                    return {
                                        ...r,
                                        steps: finishedSteps,
                                        packet: event.packet,
                                    };
                                })
                            );
                            setPhase("done");
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
        setHistory([]);
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

        const updatedHistory: ConversationTurn[] = [...history, { role: "user", content: msg }];
        setHistory(updatedHistory);

        const updatedSlots = { ...slots, description: `${slots.description} | Follow-up: ${msg}` };
        setSlots(updatedSlots);

        dispatchScout(updatedSlots, msg, updatedHistory).finally(() => {
            setIsFollowingUp(false);
        });
    }

    // ---------- INTRO / LANDING VIEW ----------
    if (!hasStarted && history.length === 0) {
        return (
            <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
                {/* Upper Left: Chats Menu Button */}
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

                {/* Left Sliding Drawer for Chats */}
                {showChatsList && (
                    <div className="fixed inset-0 z-50 flex">
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
                            onClick={() => setShowChatsList(false)}
                        />
                        {/* Drawer content */}
                        <div className="relative z-10 flex h-full w-full max-w-sm flex-col border-r border-border bg-surface-raised shadow-2xl">
                            <ChatsList onClose={() => setShowChatsList(false)} />
                        </div>
                    </div>
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
                        <form onSubmit={handleIntroSubmit} className="flex items-center gap-3 p-2.5 pl-4 pr-3">
                            <input
                                value={userHasEdited ? introText : (introText || typewriter.displayText)}
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
                                placeholder={userHasEdited ? "Describe the scene you're scouting..." : ""}
                                autoFocus
                                className={`h-12 flex-1 border-0 bg-transparent px-3 text-base transition-colors duration-300 placeholder:text-neutral-500 focus-visible:ring-0 focus:outline-none ${
                                    (userHasEdited ? introText : (introText || typewriter.displayText)) || typewriter.isFrozen
                                        ? "text-white"
                                        : "text-white/85"
                                }`}
                            />
                            <Button
                                type="submit"
                                disabled={(userHasEdited ? introText : (introText || typewriter.displayText)).trim().length < 5}
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
            </main>
        );
    }

    // Which run (if any) is "in progress and not the one currently shown" —
    // drives the LatestRunIndicator, and must live directly above whichever
    // input box is actually rendered, never as a floating sibling.
    const latestRun = runs[runs.length - 1];
    const showLatestIndicator = Boolean(latestRun) && latestRun.id !== activeRunId;

    // ---------- CONVERSATION VIEW ----------
    return (
        <div className="flex h-screen flex-col overflow-hidden">
            <div className="relative z-50">
                <AppHeader
                    title={title}
                    actions={
                        <button
                            type="button"
                            onClick={handleShareCurrentChat}
                            className="rounded-full bg-neutral-800/60 px-3 py-1.5 text-[13px] font-medium text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                        >
                            {shareCopied ? "Copied!" : "Share"}
                        </button>
                    }
                />
            </div>

            <main className="flex flex-1 overflow-hidden">
                <div className="flex w-full max-w-md flex-col border-r border-border">

                    <div className="flex flex-1 flex-col overflow-hidden">
                        {showChatsList ? (
                            <ChatsList onClose={() => setShowChatsList(false)} />
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
                                </div>

                                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
                                    {/* Merged message and activity stream */}
                                    {history.map((turn, i) => {
                                        const run = runs.find(
                                            (r) => r.triggerMessageIndex === i && r.triggerMessageContent === turn.content
                                        );
                                        const isLatestRun = run && run.id === runs[runs.length - 1]?.id;
                                        const isActive = run ? activeRunId === run.id : false;

                                        return (
                                            <div key={i} className="space-y-4">
                                                {turn.role === "user" ? (
                                                    <UserMessage content={turn.content} />
                                                ) : (
                                                    <div className="max-w-[90%] text-sm leading-relaxed text-foreground-muted">
                                                        {turn.content}
                                                    </div>
                                                )}

                                                {run && (
                                                    isLatestRun && (phase === "running" || phase === "thinking") && !run.packet ? (
                                                        <AgentTrace key={run.id} steps={run.steps} />
                                                    ) : (
                                                        <div key={run.id} className="space-y-2">
                                                            <ActivityPill run={run} isActive={isActive} onClick={() => setActiveRunId(run.id)} />

                                                            {run.packet && (
                                                                <div className="rounded-lg border border-border bg-surface p-3.5">
                                                                    <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                                                                        Scout&apos;s note
                                                                    </div>
                                                                    <div className="mt-2 space-y-1.5 text-xs">
                                                                        {run.packet.agent_reasoning.split("\n").filter(Boolean).map((line: string, li: number) => {
                                                                            const trimmed = line.trim();
                                                                            const isBullet = trimmed.startsWith("-") || trimmed.startsWith("•");
                                                                            return isBullet ? (
                                                                                <div key={li} className="flex items-start gap-2 leading-relaxed text-foreground-muted">
                                                                                    <span className="select-none text-foreground-muted/60">•</span>
                                                                                    <span>{trimmed.replace(/^[-•]\s*/, "")}</span>
                                                                                </div>
                                                                            ) : (
                                                                                <p key={li} className="mb-2.5 font-medium leading-relaxed text-foreground">
                                                                                    {trimmed}
                                                                                </p>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        );
                                    })}

                                    {phase === "thinking" && !runs.some((r) => r.triggerMessageIndex === history.length - 1) && (
                                        <div className="flex items-center gap-2 text-xs text-foreground-muted">
                                            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                                            ScoutAI is thinking...
                                        </div>
                                    )}

                                    {error && (
                                        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">{error}</div>
                                    )}
                                </div>

                                {/* ---- Input area: exactly one block renders at a time, and the
              LatestRunIndicator (if needed) always sits directly above it. ---- */}

                                {/* Fresh chat input bar when history is empty */}
                                {history.length === 0 && (phase === "intro" || phase === "clarifying") && (
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
                                                        disabled={(followUpText || introText).trim().length < 3}
                                                        className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                                                    >
                                                        <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                                                    </Button>
                                                </form>
                                            </BorderGlow>
                                        </div>
                                    </div>
                                )}

                                {history.length > 0 && (phase === "clarifying" || phase === "thinking" || phase === "running") && (
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
                                                                    if (followUpText.trim().length === 0) return;
                                                                    const message = followUpText.trim();
                                                                    setFollowUpText("");
                                                                    handleAnswer(message);
                                                                }}
                                                                className="flex items-center gap-2 p-2.5"
                                                            >
                                                                <input
                                                                    value={followUpText}
                                                                    onChange={(e) => setFollowUpText(e.target.value)}
                                                                    placeholder="Or type your own answer..."
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
                                            ) : (
                                                <BorderGlow {...GLOW_PROPS}>
                                                    <div className="flex items-center gap-2 p-2.5">
                                                        <div className="h-10 flex-1 rounded-lg bg-transparent px-2 text-sm text-foreground-muted flex items-center">
                                                            {phase === "thinking" ? "ScoutAI is thinking..." : "Researching locations..."}
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
                                                            const updatedHistory: ConversationTurn[] = [...history, { role: "user", content: message }];
                                                            setHistory(updatedHistory);
                                                            dispatchScout(lastScoutArgsRef.current.finalSlots, message, updatedHistory);
                                                        } else {
                                                            const updatedHistory: ConversationTurn[] = [...history, { role: "user", content: message }];
                                                            setHistory(updatedHistory);
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
                                                <form onSubmit={handleFollowUp} className="flex items-center gap-2 p-2.5">
                                                    <input
                                                        value={followUpText}
                                                        onChange={(e) => setFollowUpText(e.target.value)}
                                                        placeholder="Refine — 'cheaper options'..."
                                                        disabled={isFollowingUp}
                                                        className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:opacity-50"
                                                    />
                                                    <Button
                                                        type="submit"
                                                        disabled={followUpText.trim().length === 0 || isFollowingUp}
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
                    {(() => {
                        const active = runs.find((r) => r.id === activeRunId);

                        if (!active) {
                            return phase !== "thinking" && phase !== "running" ? (
                                <SuggestionPanel
                                    onSelect={(text) => {
                                        if (phase === "clarifying" && currentQuestion?.type === "text") {
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
                                    <div key={loc.id} className="max-h-[calc(100vh-4rem)] overflow-y-auto">
                                        <LocationCard location={loc} rank={i + 1} />
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
            </main>
        </div>
    );
}