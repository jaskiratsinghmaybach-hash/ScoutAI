"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SceneQuery } from "@/types";

const BUDGET_OPTIONS = [
  { value: "micro", label: "Micro · <$50K" },
  { value: "indie", label: "Indie · $50K–$500K" },
  { value: "mid", label: "Mid · $500K–$5M" },
  { value: "studio", label: "Studio · $5M+" },
] as const;

export function SceneBrief({
  onSubmit,
  isRunning,
}: {
  onSubmit: (query: SceneQuery) => void;
  isRunning: boolean;
}) {
  const [description, setDescription] = useState("");
  const [mood, setMood] = useState("");
  const [era, setEra] = useState("");
  const [budget, setBudget] = useState<SceneQuery["budget"]>("indie");
  const [region, setRegion] = useState("");
  const [requirements, setRequirements] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      description,
      mood,
      era,
      budget,
      region,
      requirements: requirements
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
    });
  };

  const isValid = description.trim().length >= 10;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-amber-400/80">
          Scene 01 — Description
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A rain-soaked confrontation on a rooftop overlooking a neon-lit city, 1980s noir atmosphere..."
          rows={4}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-amber-400/80">
            Mood
          </label>
          <input
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="Tense, isolated, melancholic"
            className="flex h-11 w-full rounded-sm border border-neutral-700 bg-neutral-900/60 px-4 text-base text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
          />
        </div>
        <div>
          <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-amber-400/80">
            Era / Period
          </label>
          <input
            value={era}
            onChange={(e) => setEra(e.target.value)}
            placeholder="1980s, present-day, near-future"
            className="flex h-11 w-full rounded-sm border border-neutral-700 bg-neutral-900/60 px-4 text-base text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-amber-400/80">
            Budget Tier
          </label>
          <div className="flex flex-wrap gap-2">
            {BUDGET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBudget(opt.value)}
                className={`rounded-sm border px-3 py-2 text-xs font-mono transition-colors ${
                  budget === opt.value
                    ? "border-amber-400 bg-amber-400/10 text-amber-300"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-amber-400/80">
            Region Preference
          </label>
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Southeast Asia, no preference..."
            className="flex h-11 w-full rounded-sm border border-neutral-700 bg-neutral-900/60 px-4 text-base text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-amber-400/80">
          Requirements (comma-separated)
        </label>
        <input
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="rooftop access, permit-friendly, night shoot allowed"
          className="flex h-11 w-full rounded-sm border border-neutral-700 bg-neutral-900/60 px-4 text-base text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
        />
      </div>

      <Button type="submit" size="lg" disabled={!isValid || isRunning} className="w-full">
        {isRunning ? "Scouting in progress..." : "Dispatch the Scout"}
      </Button>
    </form>
  );
}
