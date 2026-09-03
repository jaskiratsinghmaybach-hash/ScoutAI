"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * useOnboarding — tracks the first-run welcome flow shown in the
 * right panel. Deliberately independent of Supabase auth/profile:
 * the display name captured here is a *local* nicety (greets the
 * person by name even if they never sign in), stored the same way
 * activeView is in useAuth.ts (useSyncExternalStore over
 * localStorage, so server/first-hydration render always agrees with
 * the client instead of racing a lazy-initializer useState).
 *
 * Signed-in users who already have a Supabase display_name still go
 * through this once per browser (it's asking "what should ScoutAI
 * call you", not duplicating account profile data). OnboardingFlow pre-fills
 * the name from the account profile when one exists.
 */

const ONBOARDED_KEY = "scoutai:onboarded";
const NAME_KEY = "scoutai:local_display_name";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getOnboardedSnapshot(): boolean {
  if (typeof window === "undefined") return true; // avoid SSR flash of the flow
  return localStorage.getItem(ONBOARDED_KEY) === "1";
}

function getOnboardedServerSnapshot(): boolean {
  // Matches useAuth's pattern: server can't know localStorage, so it
  // renders the "already onboarded" state — the flow only ever
  // appears after hydration reads the real value, never flashes on
  // a fresh SSR paint for returning users, and for genuinely new
  // users the flip from true -> false happens in the same tick as
  // hydration finishes.
  return true;
}

function getNameSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(NAME_KEY);
}

function getNameServerSnapshot(): string | null {
  return null;
}

export function useOnboarding() {
  const hasOnboarded = useSyncExternalStore(
    subscribe,
    getOnboardedSnapshot,
    getOnboardedServerSnapshot,
  );
  const localDisplayName = useSyncExternalStore(
    subscribe,
    getNameSnapshot,
    getNameServerSnapshot,
  );

  const completeOnboarding = useCallback((name: string) => {
    try {
      const trimmed = name.trim();
      if (trimmed) {
        localStorage.setItem(NAME_KEY, trimmed);
      }
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch (err) {
      console.error("[Onboarding] Failed to persist:", err);
    } finally {
      notify();
    }
  }, []);

  const setLocalDisplayName = useCallback((name: string) => {
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch (err) {
      console.error("[Onboarding] Failed to persist display name:", err);
    } finally {
      notify();
    }
  }, []);

  return {
    hasOnboarded,
    localDisplayName,
    completeOnboarding,
    setLocalDisplayName,
  };
}
