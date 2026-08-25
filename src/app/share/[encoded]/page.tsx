"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { decompressFromEncodedURIComponent } from "lz-string";
import { AppHeader } from "@/components/scout/AppHeader";
import { ActivityPill } from "@/components/scout/ActivityPill";
import { LocationCard } from "@/components/scout/LocationCard";
import { UserMessage } from "@/components/scout/UserMessage";
import type { StoredChatState } from "@/lib/chatStorage";

export default function SharePage({
    params,
}: {
    params: Promise<{ encoded: string }>;
}) {
    const { encoded } = use(params);

    const state = useMemo<StoredChatState | null>(() => {
        if (!encoded) return null;
        try {
            const decompressed = decompressFromEncodedURIComponent(encoded);
            if (!decompressed) return null;
            const parsed = JSON.parse(decompressed) as StoredChatState;
            if (!parsed || !Array.isArray(parsed.history)) return null;
            return parsed;
        } catch {
            return null;
        }
    }, [encoded]);

    if (!state) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
                <div className="max-w-md space-y-4 rounded-lg border border-border bg-surface-raised p-6 shadow-xl">
                    <h2 className="text-lg font-semibold text-foreground">Link Invalid or Expired</h2>
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

    const completedRuns = (state.runs || []).filter((r) => r.packet !== null);
    const latestCompletedRun = completedRuns[completedRuns.length - 1];

    return (
        <div className="flex h-screen flex-col overflow-hidden">
            <div className="relative z-50">
                <AppHeader title={state.title} />
            </div>

            <main className="flex flex-1 overflow-hidden">
                {/* Left Column: Read-only Message and Activity Stream */}
                <div className="flex w-full max-w-md flex-col border-r border-border">
                    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
                        {state.history.map((turn, i) => {
                            const run = (state.runs || []).find(
                                (r) => r.triggerMessageIndex === i && r.triggerMessageContent === turn.content
                            );

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
                                        <div key={run.id} className="space-y-2">
                                            <ActivityPill run={run} isActive={true} onClick={() => {}} />

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
                                                                    trimmed.startsWith("-") || trimmed.startsWith("•");
                                                                return isBullet ? (
                                                                    <div
                                                                        key={li}
                                                                        className="flex items-start gap-2 leading-relaxed text-foreground-muted"
                                                                    >
                                                                        <span className="select-none text-foreground-muted/60">
                                                                            •
                                                                        </span>
                                                                        <span>{trimmed.replace(/^[-•]\s*/, "")}</span>
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
                </div>

                {/* Right Column: Location Results */}
                <div className="flex-1 overflow-y-auto px-8 py-8">
                    {latestCompletedRun?.packet ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {latestCompletedRun.packet.locations.map((loc, i) => (
                                <div key={loc.id} className="max-h-[calc(100vh-4rem)] overflow-y-auto">
                                    <LocationCard location={loc} rank={i + 1} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-foreground-muted">
                            No location results in this conversation.
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
