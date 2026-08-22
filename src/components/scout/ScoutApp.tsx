"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { SuggestionPanel } from "@/components/scout/SuggestionPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";
import BorderGlow from "@/components/scout/BorderGlow";
import { QuestionCard } from "@/components/scout/QuestionCard";
import { AgentTrace } from "@/components/scout/AgentTrace";
import { LocationCard } from "@/components/scout/LocationCard";
import { SkeletonCard } from "@/components/scout/SkeletonCard";
import { UserMessage } from "@/components/scout/UserMessage";
import { saveChatState, loadChatState, generateChatId } from "@/lib/chatStorage";
import type {
    SlotState,
    ClarifyQuestion,
    ConversationTurn,
    ScoutingPacket,
    AgentStep,
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

    const [steps, setSteps] = useState<AgentStep[]>([]);
    const [packet, setPacket] = useState<ScoutingPacket | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [followUpText, setFollowUpText] = useState("");
    const [isFollowingUp, setIsFollowingUp] = useState(false);
    const [suggestionPrefill, setSuggestionPrefill] = useState<string | undefined>(undefined);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
    const wasStoppedRef = useRef(false);
    const stoppedDuringRef = useRef<"clarify" | "research">("clarify");
    const lastScoutArgsRef = useRef<{ finalSlots: SlotState; priorContext?: string }>({ finalSlots: EMPTY_SLOTS });
    const hasStarted = phase !== "intro";
    const hydratedRef = useRef(false);

    // Auto-resize textarea height for landing page input
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, []);

    const handleIntroChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setIntroText(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    };

    // Hydrate from localStorage if we're on a /chat/[id] route
    useEffect(() => {
        if (!chatId || hydratedRef.current) return;
        hydratedRef.current = true;

        const stored = loadChatState(chatId);
        if (!stored) return;

        setHistory(stored.history);
        setSlots(stored.slots);
        setPacket(stored.packet);
        setSteps(stored.steps);

        if (stored.packet) {
            setPhase("done");
        } else if (stored.history.length === 1 && stored.history[0].role === "user") {
            // Fresh redirect from landing — only the initial user message exists,
            // no question has been asked yet. Kick off the clarify loop now.
            askForNextQuestion(stored.history, stored.slots);
        } else if (stored.history.length > 0) {
            setPhase("clarifying");
        }
    }, [chatId]);

    // Persist to localStorage whenever meaningful state changes
    useEffect(() => {
        if (!chatId || !hydratedRef.current) return;
        saveChatState(chatId, { history, slots, packet, steps });
    }, [chatId, history, slots, packet, steps]);

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
                dispatchScout(mergedSlots);
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
        if (introText.trim().length < 5) return;

        const newHistory: ConversationTurn[] = [{ role: "user", content: introText.trim() }];
        const newSlots = { ...EMPTY_SLOTS, description: introText.trim() };

        if (!chatId) {
            // Fresh start from landing page — generate an ID and move to /chat/[id]
            const newId = generateChatId();
            saveChatState(newId, { history: newHistory, slots: newSlots, packet: null, steps: [] });
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
        dispatchScout(slots);
    }

    async function dispatchScout(finalSlots: SlotState, priorContext?: string) {
        setPhase("running");
        setError(null);
        setSteps([]);
        setPacket(null);
        wasStoppedRef.current = false;
        stoppedDuringRef.current = "research";
        lastScoutArgsRef.current = { finalSlots, priorContext };

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

                // Checked immediately after every read — covers both the case
                // where cancel() makes read() resolve early with done:true, and
                // the case where it throws. Either way we bail out here.
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
                        setSteps((prev) => {
                            const filtered = prev.filter((s) => s.step !== data.step.step);
                            return [...filtered, data.step].sort((a, b) => a.step - b.step);
                        });
                    } else if (data.type === "complete") {
                        setPacket(data.packet);
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
        // Set synchronously first — this is the source of truth the running
        // loops check, independent of whatever error type each browser throws.
        wasStoppedRef.current = true;
        streamReaderRef.current?.cancel().catch(() => { });
        abortControllerRef.current?.abort();
        setPhase("stopped");
    }

    function handleFollowUp(e: React.FormEvent) {
        e.preventDefault();
        if (followUpText.trim().length === 0 || !packet) return;

        const contextSummary = `Previous results: ${packet.locations
            .map((l) => `${l.name} (score ${l.score}, ${l.avg_daily_cost})`)
            .join("; ")}. User's follow-up request: "${followUpText.trim()}"`;

        setIsFollowingUp(true);
        setFollowUpText("");
        dispatchScout(slots, contextSummary).finally(() => setIsFollowingUp(false));
    }

    // ---------- LANDING VIEW (1st File UI) ----------
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
                        <form onSubmit={handleIntroSubmit} className="flex items-end gap-3 p-5 pl-5 pr-3.5">
                            <textarea
                                ref={textareaRef}
                                value={introText}
                                onChange={handleIntroChange}
                                placeholder="A rain-soaked rooftop confrontation, 1980s noir..."
                                autoFocus
                                rows={1}
                                className="flex-1 bg-transparent font-script font-medium text-lg text-[#b0b0b0] placeholder-zinc-500 focus:outline-none focus:ring-0 resize-none py-2 max-h-[160px] min-h-[38px] leading-normal"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleIntroSubmit(e);
                                    }
                                }}
                            />
                            <Button
                                type="submit"
                                disabled={introText.trim().length < 5}
                                className="h-10 w-10 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                            >
                                <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
                            </Button>
                        </form>
                    </BorderGlow>
                </div>
            </main>
        );
    }

    // ---------- CONVERSATION VIEW ----------
    return (
        <main className="flex h-screen overflow-hidden">
            <div className="flex w-full max-w-md flex-col border-r border-border">
                <div className="flex items-center gap-2 border-b border-border px-6 py-4">
                    <Image
                        src="/logo.png"
                        alt="ScoutAI"
                        width={80}
                        height={40}
                        className="h-5 w-auto object-contain"
                    />
                </div>

                <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
                        {history.map((turn, i) =>
                            turn.role === "user" ? (
                                <UserMessage key={i} content={turn.content} />
                            ) : (
                                <div key={i} className="max-w-[90%] text-sm text-foreground-muted">
                                    {turn.content}
                                </div>
                            )
                        )}

                        {phase === "thinking" && (
                            <div className="flex items-center gap-2 text-xs text-foreground-muted">
                                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                                ScoutAI is thinking...
                            </div>
                        )}

                        {(phase === "running" || phase === "done") && steps.length > 0 && (
                            <AgentTrace steps={steps} />
                        )}

                        {error && (
                            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                                {error}
                            </div>
                        )}

                        {packet && (
                            <div className="rounded-lg border border-border bg-surface p-3">
                                <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                                    Scout&apos;s note
                                </div>
                                <p className="mt-1.5 text-xs">{packet.agent_reasoning}</p>
                            </div>
                        )}
                    </div>

                    {(phase === "clarifying" || phase === "thinking" || phase === "running") && (
                        <div className="px-6 pb-6 pt-2 shrink-0">
                            {phase === "clarifying" && currentQuestion ? (
                                <QuestionCard
                                    key={currentQuestion.text}
                                    question={currentQuestion}
                                    onAnswer={handleAnswer}
                                    onSkipAll={handleSkipAll}
                                    prefill={suggestionPrefill}
                                />
                            ) : (
                                <BorderGlow
                                    borderRadius={16}
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
                    )}

                    {phase === "stopped" && (
                        <div className="px-6 pb-6 pt-2 shrink-0">
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
                                            // Was stopped mid-research — treat the new message as
                                            // refinement context and re-run the scout, not another
                                            // clarify question.
                                            const updatedHistory: ConversationTurn[] = [
                                                ...history,
                                                { role: "user", content: message },
                                            ];
                                            setHistory(updatedHistory);
                                            dispatchScout(lastScoutArgsRef.current.finalSlots, message);
                                        } else {
                                            const updatedHistory: ConversationTurn[] = [
                                                ...history,
                                                { role: "user", content: message },
                                            ];
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
                    )}
                    {packet && (
                        <form onSubmit={handleFollowUp} className="border-t border-border p-4 shrink-0">
                            <div className="flex gap-2">
                                <Input
                                    value={followUpText}
                                    onChange={(e) => setFollowUpText(e.target.value)}
                                    placeholder="Refine — 'cheaper options'..."
                                    disabled={isFollowingUp}
                                    className="flex-1 text-sm"
                                />
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={followUpText.trim().length === 0 || isFollowingUp}
                                >
                                    {isFollowingUp ? "..." : "→"}
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-8">
                {!packet && steps.length === 0 && (
                    <SuggestionPanel
                        onSelect={(text) => {
                            if (phase === "clarifying" && currentQuestion?.type === "text") {
                                setSuggestionPrefill(text);
                            }
                        }}
                    />
                )}

                {!packet && steps.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </div>
                )}

                {packet && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {packet.locations.map((loc, i) => (
                            <div key={loc.id} className="max-h-[calc(100vh-4rem)] overflow-y-auto">
                                <LocationCard location={loc} rank={i + 1} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}