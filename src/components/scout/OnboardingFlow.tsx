"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Film, MapPin, Sparkles } from "lucide-react";

const INTENTS = [
  { id: "film", icon: Film, label: "Find a film location", detail: "Turn a scene brief into shoot-ready places." },
  { id: "inspiration", icon: Sparkles, label: "Explore visual inspiration", detail: "Discover places that match a mood or reference." },
  { id: "scout", icon: MapPin, label: "Scout a real place", detail: "Research access, permits, timing, and logistics." },
  { id: "team", icon: Building2, label: "Plan with my team", detail: "Create a clear shortlist everyone can review." },
] as const;

type Step = "welcome" | "intent" | "profile";

interface OnboardingFlowProps {
  prefillName?: string | null;
  onComplete: (name: string) => void;
  onSkip: () => void;
}

export function OnboardingFlow({ prefillName, onComplete, onSkip }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState(prefillName ?? "");
  const [intent, setIntent] = useState<string | null>(null);
  const index = step === "welcome" ? 0 : step === "intent" ? 1 : 2;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onComplete(name.trim());
  }

  return (
    <section aria-label="ScoutAI onboarding" className="relative flex h-full w-full flex-col overflow-hidden px-5 py-5 sm:px-8">
      <header className="relative flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-foreground-muted">SCOUTAI</span>
        <button type="button" onClick={onSkip} className="rounded-full px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50">Skip setup</button>
      </header>

      <div className="relative mt-7 flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-2" aria-label={`Step ${index + 1} of 3`}>
          {["Welcome", "Your brief", "Your profile"].map((label, itemIndex) => (
            <div key={label} className="flex min-w-0 flex-1 items-center gap-2">
              <span className={`h-1.5 flex-1 rounded-full ${itemIndex <= index ? "bg-foreground" : "bg-foreground/10"}`} />
              <span className={`hidden text-[11px] sm:block ${itemIndex === index ? "text-foreground" : "text-foreground-muted"}`}>{label}</span>
            </div>
          ))}
        </div>
        <span className="shrink-0 font-mono text-[11px] text-foreground-muted">0{index + 1} / 03</span>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center py-7">
        {step === "welcome" && (
          <div className="flex w-full items-center justify-between gap-12">
            <div className="mr-auto w-full max-w-xl">
              <h1 className="max-w-lg text-balance font-display text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-foreground sm:text-5xl">Let&apos;s find the place your story needs.</h1>
              <p className="mt-5 max-w-md text-pretty text-sm leading-6 text-foreground-muted">ScoutAI turns a rough scene idea into a considered shortlist with visual fit, access notes, and sources you can trust.</p>
              <div className="mt-[19px] flex flex-wrap gap-2 text-xs text-foreground-muted"><span className="rounded-full border border-border bg-foreground/[0.04] px-3 py-2">Describe a scene</span><ArrowRight className="mt-2 h-3.5 w-3.5" /><span className="rounded-full border border-border bg-foreground/[0.04] px-3 py-2">Get a smarter shortlist</span></div>
              <button type="button" onClick={() => setStep("intent")} className="mt-10 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60 active:scale-95">Start scouting <ArrowRight className="h-4 w-4" /></button>
            </div>

            <aside aria-label="ScoutAI powers" className="hidden w-[min(34vw,24rem)] shrink-0 flex-col gap-3 lg:flex">
              <div className="rounded-2xl border border-border bg-foreground/[0.035] p-4"><div className="flex items-center justify-between text-xs"><span className="text-foreground">Visual match</span><span className="font-mono text-foreground-muted">92%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10"><div className="h-full w-[92%] rounded-full bg-foreground/75" /></div><p className="mt-3 text-xs leading-5 text-foreground-muted">Finds locations that fit the look, mood, and story.</p></div>
              <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-border bg-foreground/[0.025] p-4"><MapPin className="h-4 w-4 text-foreground-muted" /><p className="mt-3 text-xs font-semibold text-foreground">Place intelligence</p><p className="mt-1 text-xs leading-5 text-foreground-muted">Access, permits, and timing.</p></div><div className="rounded-2xl border border-border bg-foreground/[0.025] p-4"><Check className="h-4 w-4 text-foreground-muted" /><p className="mt-3 text-xs font-semibold text-foreground">Trusted sources</p><p className="mt-1 text-xs leading-5 text-foreground-muted">Evidence behind every pick.</p></div></div>
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-foreground/[0.025] p-4 text-xs text-foreground-muted"><span className="h-2 w-2 rounded-full bg-foreground" />Build a shortlist your team can act on.</div>
            </aside>
          </div>
        )}

        {step === "intent" && (
          <div className="mr-auto w-full max-w-2xl"><button type="button" onClick={() => setStep("welcome")} className="mb-7 inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"><ArrowLeft className="h-3.5 w-3.5" /> Back</button><h2 className="text-balance font-display text-3xl font-semibold tracking-[-0.03em] text-foreground">What are you scouting today?</h2><p className="mt-2 text-sm leading-6 text-foreground-muted">Pick the closest fit. You can change direction anytime.</p><div className="mt-7 grid gap-2 sm:grid-cols-2">{INTENTS.map(({ id, icon: Icon, label, detail }) => { const selected = intent === id; return <button key={id} type="button" aria-pressed={selected} onClick={() => setIntent(id)} className={`group flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60 ${selected ? "border-foreground bg-foreground/[0.1]" : "border-border bg-foreground/[0.025] hover:border-foreground/30 hover:bg-foreground/[0.05]"}`}><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-foreground text-background" : "bg-foreground/[0.08] text-foreground-muted"}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">{label}{selected && <Check className="h-4 w-4" />}</span><span className="mt-1 block text-xs leading-5 text-foreground-muted">{detail}</span></span></button>; })}</div><button type="button" disabled={!intent} onClick={() => setStep("profile")} className="mt-7 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60">Continue <ArrowRight className="h-4 w-4" /></button></div>
        )}

        {step === "profile" && (
          <div className="mr-auto w-full max-w-md"><button type="button" onClick={() => setStep("intent")} className="mb-7 inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"><ArrowLeft className="h-3.5 w-3.5" /> Back</button><h2 className="text-balance font-display text-3xl font-semibold tracking-[-0.03em] text-foreground">One last thing.</h2><p className="mt-2 text-sm leading-6 text-foreground-muted">What should ScoutAI call you? This is optional and only personalizes your workspace.</p><form onSubmit={submit} className="mt-7 flex max-w-sm flex-col gap-3"><label htmlFor="onboarding-name" className="text-xs font-medium text-foreground-muted">Your name</label><input id="onboarding-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex Morgan" className="h-12 rounded-xl border border-border bg-foreground/[0.04] px-4 text-sm text-foreground placeholder:text-foreground-muted focus:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20" /><button type="submit" className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60 active:scale-95">Enter<ArrowRight className="h-4 w-4" /></button></form></div>
        )}
      </div>
    </section>
  );
}
