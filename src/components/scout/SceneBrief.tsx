"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SceneQuery } from "@/types";

const BUDGET_OPTIONS = [
  { value: "micro", label: "Micro" },
  { value: "indie", label: "Indie" },
  { value: "mid", label: "Mid" },
  { value: "studio", label: "Studio" },
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
    <Card>
      <CardContent className="space-y-5 pt-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="description">Scene description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A rain-soaked confrontation on a rooftop overlooking a neon-lit city, 1980s noir atmosphere..."
              className="h-24"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mood">Mood</Label>
              <Input
                id="mood"
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                placeholder="Tense, isolated, melancholic"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="era">Era / period</Label>
              <Input
                id="era"
                value={era}
                onChange={(e) => setEra(e.target.value)}
                placeholder="1980s, present-day, near-future"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Budget tier</Label>
            <div className="flex gap-2">
              {BUDGET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBudget(opt.value)}
                  className={cn(
                    "h-9 flex-1 rounded-md border text-sm transition-colors",
                    budget === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="region">Region preference</Label>
              <Input
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Southeast Asia, no preference"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="requirements">Requirements</Label>
              <Input
                id="requirements"
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="rooftop access, permit-friendly"
              />
            </div>
          </div>

          <Button type="submit" size="lg" disabled={!isValid || isRunning} className="w-full">
            {isRunning ? "Scouting…" : "Dispatch the scout"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
