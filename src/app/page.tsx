"use client";

import { useState } from "react";
import { SceneBrief } from "@/components/scout/SceneBrief";
import { AgentTrace } from "@/components/scout/AgentTrace";
import { LocationCard } from "@/components/scout/LocationCard";
import type { SceneQuery, ScoutingPacket, AgentStep } from "@/types";

export default function Home() {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [packet, setPacket] = useState<ScoutingPacket | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(query: SceneQuery) {
    setIsRunning(true);
    setError(null);
    setPacket(null);
    setSteps([]);

    try {
      const res = await fetch("/api/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
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
          } else if (data.type === "error") {
            setError(data.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <header className="mb-10">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-success" />
          <span className="font-mono text-xs uppercase tracking-wide text-foreground-muted">
            ScoutAI
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Find the location before you find the flight
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Describe your scene. An AI agent researches real filming locations —
          permits, past productions, cost, and weather — using Gemini and Parallel Search.
        </p>
      </header>

      <div className="space-y-6">
        <SceneBrief onSubmit={handleSubmit} isRunning={isRunning} />

        {(isRunning || steps.length > 0) && <AgentTrace steps={steps} />}

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {packet && (
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Scout&apos;s note
              </div>
              <p className="mt-2 text-sm">{packet.agent_reasoning}</p>
            </div>

            <div className="space-y-4">
              {packet.locations.map((loc, i) => (
                <LocationCard key={loc.id} location={loc} rank={i + 1} />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
