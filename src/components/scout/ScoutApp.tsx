"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
import { useTypewriter } from "@/lib/useTypewriter";
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

export function ScoutApp({ chatId }: { chatId?: string }) {
    const router = useRouter();
    const [phase, setPhase] = useState<Phase>("intro");
    const [introText, setIntroText] = useState("");
    const [history, setHistory] = useState<ConversationTurn[]>([]);
    const [slots, setSlots] = useState<SlotState>(EMPTY_SLOTS);
    const [currentQuestion, setCurrentQuestion] = useState<ClarifyQuestion | null>(null);

    const [runs, setRuns] = useState<ScoutRun[]>([]);
    const [activeRunId, setActiveRunId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [followUpText, setFollowUpText] = useState("");
    const [isFollowingUp, setIsFollowingUp] = useState(false);
    const [suggestionPrefill, setSuggestionPrefill] = useState<string | undefined>(undefined);
    const [landingSuggestions, setLandingSuggestions] = useState<string[]>([]);
    useEffect(() => {
        setLandingSuggestions(getRandomSuggestions(3));
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
        if (!chatId || hydratedRef.current) return;
        hydratedRef.current = true;

        const stored = loadChatState(chatId);
        if (!stored) return;

        setHistory(stored.history);
        setSlots(stored.slots);
        setRuns(stored.runs ?? []);
        setActiveRunId(stored.runs?.length ? stored.runs[stored.runs.length - 1].id : null);

        if (stored.runs?.some((r) => r.packet)) {
            setPhase("done");
        } else if (stored.history.length === 1 && stored.history[0].role === "user") {
            askForNextQuestion(stored.history, stored.slots);
        } else if (stored.history.length > 0) {
            setPhase("clarifying");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatId]);

    // Persist to localStorage whenever meaningful state changes
    useEffect(() => {
        if (!chatId || !hydratedRef.current) return;
        saveChatState(chatId, { history, slots, runs });
    }, [chatId, history, slots, runs]);

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
        const submittedText = introText.trim() || typewriter.displayText.trim();
        if (submittedText.length < 5) return;

        const newHistory: ConversationTurn[] = [{ role: "user", content: submittedText }];
        const newSlots = { ...EMPTY_SLOTS, description: submittedText };

        if (!chatId) {
            const newId = generateChatId();
            saveChatState(newId, { history: newHistory, slots: newSlots, runs: [] });
            router.push(`/chat/${newId}`);
            return;
        }

        setHistory(newHistory);
        setSlots(newSlots);
        askForNextQuestion(newHistory, newSlots);
    }

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
        dispatchScout(slots, undefined, history);
    }

    async function dispatchScout(
        finalSlots: SlotState,
        priorContext?: string,
        historyAtDispatch?: ConversationTurn[]
    ) {
        setPhase("running");
        setError(null);
        wasStoppedRef.current = false;
        stoppedDuringRef.current = "research";
        lastScoutArgsRef.current = { finalSlots, priorContext };

        const runId = generateChatId();
        const effectiveHistory = historyAtDispatch ?? history;
        const triggerIndex = effectiveHistory.length - 1;
        const triggerContent = effectiveHistory[triggerIndex]?.content ?? "";
        setRuns((prev) => [
            ...prev,
            { id: runId, steps: [], packet: null, triggerMessageIndex: triggerIndex, triggerMessageContent: triggerContent },
        ]);

        setActiveRunId((prevActiveId) => {
            const prevRun = runs.find((r) => r.id === prevActiveId);
            const isViewingOlderCompletedRun =
                prevRun && prevRun.packet !== null && prevActiveId !== runs[runs.length - 1]?.id;
            return isViewingOlderCompletedRun ? prevActiveId : runId;
        });

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
                    budget: finalSlots.budget || "indie",
                    region: finalSlots.region,
                    requirements: finalSlots.requirements
                        ? finalSlots.requirements.split(",").map((r) => r.trim())
                        : [],
                    priorContext,
                }),
                signal: controller.signal,
            });

            if (wasStoppedRef.current) {
                setPhase("stopped");
                return;
            }

            if (!res.body) throw new Error("No response stream");

            const reader = res.body.getReader();
            streamReaderRef.current = reader;
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();

                if (wasStoppedRef.current) {
                    setPhase("stopped");
                    return;
                }

                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const data = JSON.parse(line.slice(6));

                    if (data.type === "step") {
                        setRuns((prev) =>
                            prev.map((r) =>
                                r.id !== runId
                                    ? r
                                    : {
                                        ...r,
                                        steps: [...r.steps.filter((s) => s.step !== data.step.step), data.step].sort(
                                            (a, b) => a.step - b.step
                                        ),
                                    }
                            )
                        );
                    } else if (data.type === "complete") {
                        setRuns((prev) => prev.map((r) => (r.id === runId ? { ...r, packet: data.packet } : r)));
                        setPhase("done");
                    } else if (data.type === "error") {
                        setError(data.message);
                        setPhase("done");
                    }
                }
            }
        } catch (err) {
            if (wasStoppedRef.current || (err instanceof DOMException && err.name === "AbortError")) {
                setPhase("stopped");
                return;
            }
            setError(err instanceof Error ? err.message : "Something went wrong");
            setPhase("done");
        } finally {
            streamReaderRef.current = null;
            abortControllerRef.current = null;
        }
    }

    function handleStop() {
        wasStoppedRef.current = true;
        streamReaderRef.current?.cancel().catch(() => { });
        abortControllerRef.current?.abort();
        setPhase("stopped");
    }

    function handleFollowUp(e: React.FormEvent) {
        e.preventDefault();
        const text = followUpText.trim();
        const latestRun = runs[runs.length - 1];
        if (text.length === 0 || !latestRun?.packet) return;

        const contextSummary = `Previous results: ${latestRun.packet.locations
            .map((l) => `${l.name} (score ${l.score}, ${l.avg_daily_cost})`)
            .join("; ")}. User's follow-up request: "${text}"`;

        const updatedHistory: ConversationTurn[] = [...history, { role: "user", content: text }];
        setHistory(updatedHistory);

        setIsFollowingUp(true);
        setFollowUpText("");
        dispatchScout(slots, contextSummary, updatedHistory).finally(() => setIsFollowingUp(false));
    }

    // ---------- LANDING VIEW ----------
    if (!hasStarted) {
        return (
            <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-24">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.06),transparent_60%)]" />

                <div className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center">
                    <Image
                        src="/wave-mark.avif"
                        alt=""
                        width={168}
                        height={84}
                        priority
                        className="h-20 w-40 object-contain"
                    />
                    <h1 className="mt-[26px] mb-[5px] font-display text-[32px] sm:text-[45px] tracking-tight leading-tight">
                        Describe the scene.
                        <br />
                        We&apos;ll find the set.
                    </h1>

                    <BorderGlow
                        className="mt-10 w-full"
                        borderRadius={24}
                        glowRadius={36}
                        glowIntensity={1.2}
                        coneSpread={30}
                        edgeSensitivity={25}
                        backgroundColor="#18181b"
                        colors={["#8B5CF6", "#3ECF6D", "#8B5CF6"]}
                        glowColor="265 80% 70%"
                    >
                        <form onSubmit={handleIntroSubmit} className="flex items-center gap-3 p-2.5 pl-4 pr-3">
                            <input
                                value={introText || typewriter.displayText}
                                onChange={(e) => {
                                    if (!typewriter.isFrozen) typewriter.freeze();
                                    setIntroText(e.target.value);
                                }}
                                onMouseDown={() => {
                                    if (!typewriter.isFrozen) typewriter.freeze();
                                }}
                                placeholder=""
                                autoFocus
                                className={`h-12 flex-1 border-0 bg-transparent px-3 text-base transition-colors duration-300 focus-visible:ring-0 focus:outline-none ${introText || typewriter.isFrozen ? "text-white" : "text-white/85"
                                    }`}
                            />
                            <Button
                                type="submit"
                                disabled={(introText || typewriter.displayText).trim().length < 5}
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
                                }}
                                className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
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
        <main className="flex h-screen overflow-hidden">
            <div className="flex w-full max-w-md flex-col border-r border-border">
                <div className="flex items-center gap-2 border-b border-border px-6 py-4">
                    <Image src="/logo.png" alt="ScoutAI" width={80} height={40} className="h-5 w-auto object-contain" />
                </div>

                <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
                        {/* Single merged pass: each message renders immediately followed
                by its own run's trace/pill, if any — guarantees correct
                chronological order instead of two separate stacked loops. */}
                        {history.map((turn, i) => {
                            const run = runs.find(
                                (r) => r.triggerMessageIndex === i && r.triggerMessageContent === turn.content
                            );
                            const isLatestRun = run && run.id === runs[runs.length - 1]?.id;

                            return (
                                <div key={i} className="space-y-2">
                                    {turn.role === "user" ? (
                                        <UserMessage content={turn.content} />
                                    ) : (
                                        <div className="max-w-[90%] text-sm text-foreground-muted">{turn.content}</div>
                                    )}

                                    {run &&
                                        (isLatestRun && (phase === "running" || phase === "thinking") && !run.packet ? (
                                            <AgentTrace steps={run.steps} />
                                        ) : (
                                            <ActivityPill
                                                run={run}
                                                isActive={activeRunId === run.id}
                                                onClick={() => setActiveRunId(run.id)}
                                            />
                                        ))}
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

                        {(() => {
                            const active = runs.find((r) => r.id === activeRunId);
                            if (!active?.packet) return null;
                            return (
                                <div className="rounded-lg border border-border bg-surface p-3">
                                    <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                                        Scout&apos;s note
                                    </div>
                                    <div className="mt-1.5 space-y-1 text-xs">
                                        {active.packet.agent_reasoning
                                            .split("\n")
                                            .filter(Boolean)
                                            .map((line: string, i: number) => {
                                                const trimmed = line.trim();
                                                const isBullet = trimmed.startsWith("-") || trimmed.startsWith("•");
                                                return isBullet ? (
                                                    <div key={i} className="flex gap-1.5 text-foreground-muted">
                                                        <span>•</span>
                                                        <span>{trimmed.replace(/^[-•]\s*/, "")}</span>
                                                    </div>
                                                ) : (
                                                    <p key={i} className="font-medium text-foreground">
                                                        {trimmed}
                                                    </p>
                                                );
                                            })}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* ---- Input area: exactly one block renders at a time, and the
              LatestRunIndicator (if needed) always sits directly above it. ---- */}

                    {(phase === "clarifying" || phase === "thinking" || phase === "running") && (
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
                                            <BorderGlow
                                                borderRadius={30}
                                                glowRadius={24}
                                                glowIntensity={0.6}
                                                coneSpread={30}
                                                edgeSensitivity={25}
                                                backgroundColor="#0a0a0a"
                                                colors={["#8B5CF6", "#3ECF6D", "#8B5CF6"]}
                                                glowColor="265 80% 70%"
                                            >
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
                                    <BorderGlow
                                        borderRadius={30}
                                        glowRadius={24}
                                        glowIntensity={0.6}
                                        coneSpread={30}
                                        edgeSensitivity={25}
                                        backgroundColor="#0a0a0a"
                                        colors={["#8B5CF6", "#3ECF6D", "#8B5CF6"]}
                                        glowColor="265 80% 70%"
                                    >
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
                                <BorderGlow
                                    borderRadius={30}
                                    glowRadius={24}
                                    glowIntensity={0.6}
                                    coneSpread={30}
                                    edgeSensitivity={25}
                                    backgroundColor="#0a0a0a"
                                    colors={["#8B5CF6", "#3ECF6D", "#8B5CF6"]}
                                    glowColor="265 80% 70%"
                                >
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
                                <BorderGlow
                                    borderRadius={30}
                                    glowRadius={24}
                                    glowIntensity={0.6}
                                    coneSpread={30}
                                    edgeSensitivity={25}
                                    backgroundColor="#0a0a0a"
                                    colors={["#8B5CF6", "#3ECF6D", "#8B5CF6"]}
                                    glowColor="265 80% 70%"
                                >
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
    );
}