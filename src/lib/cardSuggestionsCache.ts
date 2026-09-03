import type { Location } from "@/types";

/**
 * Persists the 2-3 per-card "Suggestions" questions (from
 * /api/card-suggestions) in localStorage, keyed by location id, and
 * exposes a background-prefetch helper so they're generated the
 * moment a result packet lands rather than when the user clicks the
 * dropdown open. This is what makes switching between cards (e.g.
 * House Of The Palms -> Greystone Mansion) show suggestions instantly
 * instead of re-running the Gemini call and making the user wait —
 * once a location has been prefetched this session, its entry just
 * sits in localStorage until the tab/browser clears it.
 *
 * Deliberately localStorage rather than account storage: this is a
 * disposable UI nicety, not data the user needs synced across
 * devices, so the extra plumbing of account-backed storage isn't
 * worth it here.
 */

const STORAGE_PREFIX = "scoutai:card-suggestions:";

// In-flight promises, deduped by location id, so a card that's
// already being prefetched in the background doesn't get double-
// requested if the user opens its dropdown (or another prefetch call
// runs) before the first request lands.
const inFlight = new Map<string, Promise<string[]>>();

function storageKey(locationId: string) {
  return `${STORAGE_PREFIX}${locationId}`;
}

function readCache(locationId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(locationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.some((s) => typeof s !== "string")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(locationId: string, suggestions: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(locationId), JSON.stringify(suggestions));
  } catch (err) {
    // Quota exceeded or storage disabled — suggestions just won't
    // persist this time; nothing in the UI depends on the write
    // succeeding, so this is safe to swallow.
    console.error("Failed to cache card suggestions:", err);
  }
}

/** Synchronous read — used by the dropdown to show a cached result instantly, with no loading flash. */
export function getCachedCardSuggestions(locationId: string): string[] | null {
  return readCache(locationId);
}

/**
 * Ensures suggestions for this location are cached, fetching from
 * /api/card-suggestions only if they aren't already (in localStorage
 * or already in flight). Safe to call redundantly — e.g. once per
 * card in a background prefetch pass, and again if the user opens
 * that card's dropdown before the pass finishes.
 */
export function ensureCardSuggestions(location: Location): Promise<string[]> {
  const cached = readCache(location.id);
  if (cached) return Promise.resolve(cached);

  const existing = inFlight.get(location.id);
  if (existing) return existing;

  const request = fetch("/api/card-suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location }),
  })
    .then((res) => res.json())
    .then((data: { suggestions?: string[] }) => {
      const suggestions = data.suggestions ?? [];
      writeCache(location.id, suggestions);
      return suggestions;
    })
    .catch(() => {
      // Deliberately not cached on failure — leaves it eligible for
      // retry on the next prefetch pass or dropdown open, instead of
      // permanently locking in an empty result from a transient error.
      return [];
    })
    .finally(() => {
      inFlight.delete(location.id);
    });

  inFlight.set(location.id, request);
  return request;
}

/**
 * Kicks off background prefetching for every location in a result
 * packet at once, so all 4 cards' suggestions are ready (or on their
 * way) before the user has clicked into any of them. Fire-and-forget —
 * callers don't need the results, just the side effect of populating
 * the cache.
 */
export function prefetchCardSuggestions(locations: Location[]): void {
  for (const location of locations) {
    void ensureCardSuggestions(location);
  }
}
