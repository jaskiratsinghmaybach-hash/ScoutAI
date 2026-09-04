"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import BorderGlow from "@/components/scout/BorderGlow";
import type { ClarifyQuestion } from "@/types";

export function QuestionCard({
  question,
  onAnswer,
  onSkipAll,
  prefill,
  disabled,
}: {
  question: ClarifyQuestion;
  onAnswer: (answer: string) => void;
  onSkipAll: () => void;
  prefill?: string;
  disabled?: boolean;
}) {
  const [textValue, setTextValue] = useState(prefill ?? "");

  useEffect(() => {
    if (prefill !== undefined) setTextValue(prefill);
  }, [prefill]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (textValue.trim().length === 0) return;
    onAnswer(textValue.trim());
    setTextValue("");
  };

  return (
    <div className="space-y-2">
      {question.type === "choice" && question.options ? (
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => (
            <span
              key={opt}
              title={disabled ? "Complete onboarding to start sending messages" : undefined}
            >
              <button
                onClick={() => !disabled && onAnswer(opt)}
                disabled={disabled}
                className="rounded-full bg-neutral-800/60 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-800/60 disabled:hover:text-neutral-300"
              >
                {opt}
              </button>
            </span>
          ))}
        </div>
      ) : (
        <BorderGlow
          borderRadius={30}
          glowRadius={24}
          glowIntensity={0.5}
          coneSpread={30}
          edgeSensitivity={25}
          backgroundColor="#0a0a0a"
          colors={["#ffffff", "#71717a", "#ffffff"]}
          glowColor="0 0% 95%"
        >
          <form onSubmit={handleTextSubmit} className="flex items-center gap-2 p-1.5">
            <input
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Type your answer..."
              autoFocus
              disabled={disabled}
              className="font-script h-10 flex-1 border-0 bg-transparent px-2 text-sm text-white/90 placeholder:text-foreground-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span title={disabled ? "Complete onboarding to start sending messages" : undefined}>
              <button
                type="submit"
                disabled={disabled || textValue.trim().length === 0}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </span>
          </form>
        </BorderGlow>
      )}

      <button
        onClick={() => !disabled && onSkipAll()}
        disabled={disabled}
        className="text-xs text-foreground-muted underline underline-offset-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-foreground-muted"
      >
        Skip all — use my answers so far
      </button>
    </div>
  );
}