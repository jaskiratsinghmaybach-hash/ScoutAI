"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, Film, ShieldCheck, Link2, ArrowRight } from "lucide-react";

/**
 * First-run welcome flow for the right panel. Shown once per browser
 * (gated by useOnboarding's hasOnboarded flag) regardless of whether
 * the person arrived via the bare landing page or already typed a
 * scene and got routed into /chat/[id] — the left side keeps running
 * its own conversation/clarifying flow the whole time; this only ever
 * occupies the right panel's idle slot, so nothing here blocks or
 * delays the scout pipeline.
 *
 * Three steps: Welcome -> Features -> Name. Every step is skippable
 * (skip jumps straight to completing onboarding with whatever name,
 * if any, was already typed) so nobody gets stuck in front of it.
 *
 * Sizing note: this right panel is a wide primary surface (often
 * 900px+), not a narrow sidebar. The welcome/name steps stay
 * narrow and centered on purpose (they're single focal statements),
 * but the features step uses a wider, four-across row so it reads
 * as a real product surface instead of a mobile card stack.
 */

const FEATURES = [
  {
    icon: Film,
    title: "Scene",
    description: "What the place actually looks and feels like to shoot in.",
  },
  {
    icon: Compass,
    title: "Shoot",
    description: "Mood and era fit, weather timing, and logistics notes.",
  },
  {
    icon: ShieldCheck,
    title: "Access",
    description: "Permit requirements, so nothing derails on shoot day.",
  },
  {
    icon: Link2,
    title: "Sources",
    description: "Every claim backed by a verifiable, linkable source.",
  },
] as const;

type Step = "welcome" | "features" | "name";

interface OnboardingFlowProps {
  prefillName?: string | null;
  onComplete: (name: string) => void;
  onSkip: () => void;
}

const stepVariants = {
  enter: { opacity: 0, x: 16 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
};

// Shared primary/secondary action styling so every step's buttons are
// pixel-identical instead of independently re-typed with drifting
// padding/sizes.
const PRIMARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-all duration-200 hover:bg-zinc-200 active:scale-95";
const SKIP_BUTTON =
  "text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-300";

export function OnboardingFlow({
  prefillName,
  onComplete,
  onSkip,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState(prefillName ?? "");

  const stepIndex = step === "welcome" ? 0 : step === "features" ? 1 : 2;

  function handleSubmitName(e: React.FormEvent) {
    e.preventDefault();
    onComplete(name);
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-4 py-2">
      {/* Ambient glow — same treatment as RightPanelIdle, so the idle
          state and onboarding read as one continuous surface rather
          than two differently-styled screens. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-white/[0.06] blur-[90px]"
      />

      {/* Progress dots */}
      <div className="relative mb-8 flex shrink-0 items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === stepIndex ? "w-6 bg-white" : "w-1.5 bg-neutral-700"
            }`}
          />
        ))}
      </div>

      <div className="relative flex w-full items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <motion.div
              key="welcome"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex w-full max-w-md flex-col items-center text-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white">
                <Compass className="h-8 w-8" />
              </div>
              <h1 className="font-display mt-6 text-[34px] font-bold leading-[1.1] tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-neutral-400">
                Welcome to ScoutAI
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-foreground-muted">
                Your AI location scout — describe a scene, and get real,
                permit-ready places back in minutes.
              </p>
              <button
                type="button"
                onClick={() => setStep("features")}
                className={`mt-10 ${PRIMARY_BUTTON}`}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={onSkip} className={`mt-4 ${SKIP_BUTTON}`}>
                Skip
              </button>
            </motion.div>
          )}

          {step === "features" && (
            <motion.div
              key="features"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex w-full max-w-3xl flex-col items-center text-center"
            >
              <h2 className="font-display text-2xl font-semibold text-foreground">
                What you get with every location
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-foreground-muted">
                Every scout run comes back structured the same way, every time.
              </p>

              <div className="mt-8 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
                {FEATURES.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="flex h-full flex-col items-center gap-3 rounded-xl border border-border bg-neutral-900/60 px-4 py-6 text-center"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800/80 text-neutral-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold leading-tight text-foreground">
                        {title}
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground-muted">
                        {description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setStep("name")}
                className={`mt-10 ${PRIMARY_BUTTON}`}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={onSkip} className={`mt-4 ${SKIP_BUTTON}`}>
                Skip
              </button>
            </motion.div>
          )}

          {step === "name" && (
            <motion.div
              key="name"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex w-full max-w-md flex-col items-center text-center"
            >
              <h2 className="font-display text-2xl font-semibold text-foreground">
                What should we call you?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
                So ScoutAI can greet you properly. Totally optional.
              </p>
              <form
                onSubmit={handleSubmitName}
                className="mt-8 flex w-full max-w-xs flex-col items-center gap-4"
              >
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="h-12 w-full rounded-full border border-border bg-neutral-900/60 px-4 text-center text-sm text-foreground placeholder-foreground-muted backdrop-blur-sm focus:border-border-strong focus:outline-none"
                />
                <button type="submit" className={PRIMARY_BUTTON}>
                  {name.trim() ? "Let's go" : "Skip for now"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}