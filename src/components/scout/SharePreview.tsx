"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { decompressFromEncodedURIComponent } from "lz-string";
import { AppHeader } from "@/components/scout/AppHeader";
import { ActivityPill } from "@/components/scout/ActivityPill";
import { LocationCard } from "@/components/scout/LocationCard";
import { UserMessage } from "@/components/scout/UserMessage";
import type { StoredChatState } from "@/lib/chatStorage";

function decodeSharedState(encoded: string | null): StoredChatState | null {
    if (!encoded) return null;

    try {
        const normalized = decodeURIComponent(encoded.trim());
        const decompressed = decompressFromEncodedURIComponent(normalized);
        if (!decompressed) return null;

        const parsed = JSON.parse(decompressed) as StoredChatState;
        if (!parsed || !Array.isArray(parsed.history)) return null;

        return {
            ...parsed,
            runs: Array.isArray(parsed.runs) ? parsed.runs : [],
        };
    } catch {
        return null;
    }
}

function getHashPayload() {
    if (typeof window === "undefined") return null;

    const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;

    if (!hash) return null;

    const params = new URLSearchParams(hash);
    return params.get("payload") || hash;
}

export function SharePreview({ encodedFromPath }: { encodedFromPath?: string }) {
    const [encodedFromHash, setEncodedFromHash] = useState<string | null>(null);

    useEffect(() => {
        const hashTimer = window.setTimeout(() => {
            setEncodedFromHash(getHashPayload());
        }, 0);

        const handleHashChange = () => setEncodedFromHash(getHashPayload());
        window.addEventListener("hashchange", handleHashChange);

        return () => {
            window.clearTimeout(hashTimer);
            window.removeEventListener("hashchange", handleHashChange);
        };
    }, []);

    const state = useMemo(
        () => decodeSharedState(encodedFromHash || encodedFromPath || null),
        [encodedFromHash, encodedFromPath],
    );

    if (!state) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
                <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface-raised p-6 shadow-xl">
                    <h2 className="text-lg font-semibold text-foreground">
                        Link Invalid or Expired
                    </h2>
                    <p className="text-sm text-foreground-muted">
                        This share link is invalid or has expired.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center rounded-full bg-neutral-800/60 px-4 py-2 text-sm text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                    >
                        Go to ScoutAI
                    </Link>
                </div>
            </div>
        );
    }

    const completedRuns = state.runs.filter((r) => r.packet !== null);
    const latestCompletedRun = completedRuns[completedRuns.length - 1];

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
                <AppHeader title={state.title} />
            </div>

            <main className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr]">
                <section className="border-b border-border lg:border-b-0 lg:border-r">
                    <div className="space-y-4 px-4 py-5 sm:px-6 lg:max-h-[calc(100vh-41px)] lg:overflow-y-auto">
                        {state.history.map((turn, i) => {
                            const run = state.runs.find(
                                (r) =>
                                    r.triggerMessageIndex === i &&
                                    r.triggerMessageContent === turn.content,
                            );

                            return (
                                <div key={`${turn.role}-${i}`} className="space-y-4">
                                    {turn.role === "user" ? (
                                        <UserMessage content={turn.content} />
                                    ) : (
                                        <div className="max-w-[90%] text-sm leading-relaxed text-foreground-muted">
                                            {turn.content}
                                        </div>
                                    )}

                                    {run && (
                                        <div className="space-y-2">
                                            <ActivityPill
                                                run={run}
                                                isActive={true}
                                                onClick={() => {}}
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
                                                            .map((line, li) => {
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
                                                                            {trimmed.replace(
                                                                                /^[-•]\s*/,
                                                                                "",
                                                                            )}
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
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className="px-4 py-5 sm:px-6 lg:max-h-[calc(100vh-41px)] lg:overflow-y-auto lg:px-8 lg:py-8">
                    {latestCompletedRun?.packet ? (
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            {latestCompletedRun.packet.locations.map((loc, i) => (
                                <LocationCard key={loc.id} location={loc} rank={i + 1} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex min-h-48 items-center justify-center rounded-lg border border-border bg-surface text-sm text-foreground-muted">
                            No location results in this conversation.
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
