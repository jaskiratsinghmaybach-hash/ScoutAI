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
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 sm:py-24">
      <header className="mb-16">
        <div className="font-mono text-xs uppercase tracking-widest text-amber-400/80">
          ScoutAI — Field Dossier
        </div>
        <h1 className="mt-3 font-serif text-4xl italic text-neutral-50 sm:text-5xl">
          Find the location before you find the flight.
        </h1>
        <p className="mt-4 max-w-xl text-neutral-400">
          Describe your scene. An AI location scout researches real filming
          locations — permits, past productions, costs, and weather —
          using Gemini and Parallel Search.
        </p>
      </header>

      <SceneBrief onSubmit={handleSubmit} isRunning={isRunning} />

      {(isRunning || steps.length > 0) && (
        <div className="mt-10">
          <AgentTrace steps={steps} />
        </div>
      )}

      {error && (
        <div className="mt-6 border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {packet && (
        <div className="mt-12 space-y-8">
          <div className="border-t border-neutral-800 pt-8">
            <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">
              Scout&apos;s Note
            </div>
            <p className="mt-2 font-serif text-lg italic text-neutral-200">
              {packet.agent_reasoning}
            </p>
          </div>

          <div className="space-y-6">
            {packet.locations.map((loc, i) => (
              <LocationCard key={loc.id} location={loc} rank={i + 1} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
