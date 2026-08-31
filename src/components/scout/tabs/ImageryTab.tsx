"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, ImageOff, Info, Loader2 } from "lucide-react";
import type { Location, LocationImage } from "@/types";

type FetchState = "loading" | "loaded" | "error";

/**
 * Image loading strategy (see agent.ts's attachTopImage for the
 * server side of this): the scout pipeline only fetches images for
 * the #1-ranked location before returning the packet — that location
 * already has `location.images` populated the moment this component
 * mounts, so it renders immediately with zero extra network wait.
 * Every other location has `location.images` undefined and fetches
 * its own images from /api/images independently, on mount, the moment
 * its tab is actually shown — with its own loading spinner and its
 * own "no images found" fallback. One location's fetch can never
 * affect another's.
 *
 * Component split (see react-hooks/set-state-in-effect —
 * https://react.dev/reference/eslint-plugin-react-hooks/lints/set-state-in-effect):
 * this outer component's only job is to key its child by
 * `location.id`. That's the React-recommended way to reset per-
 * location state (like the photo index) on a prop change — remounting
 * a freshly-keyed child gives it fresh initial state for free, instead
 * of an effect that calls setState to reset something, which the rule
 * (correctly) flags as an avoidable extra render.
 */
export function ImageryTab({ location }: { location: Location }) {
  return <ImageryTabInner key={location.id} location={location} />;
}

function ImageryTabInner({ location }: { location: Location }) {
  const [index, setIndex] = useState(0);
  const [showAttribution, setShowAttribution] = useState(false);
  // Initial state is computed directly from props, not set again
  // synchronously later — this is what lets the effect below ONLY
  // ever call setState from inside its async .then()/.catch()
  // callbacks, which is the pattern react-hooks/set-state-in-effect
  // allows (it flags synchronous setState in the effect body itself,
  // not state updates from a genuinely async callback).
  const [fetchedImages, setFetchedImages] = useState<LocationImage[] | null>(
    location.images ?? null,
  );
  const [fetchState, setFetchState] = useState<FetchState>(() => {
    if (location.images) return "loaded";
    if (!location.image_query) return "error";
    return "loading";
  });
  // Guards against a slow response landing after this component has
  // unmounted (e.g. the user switched pills) — without this, a stale
  // fetch could call setState on an unmounted component.
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Already have images (the #1 result, passed in via props), or
    // there's no query to search with at all — both cases are already
    // correctly reflected in fetchState's initial value above, so
    // there's nothing for this effect to do and no setState call
    // needed for either.
    if (location.images || !location.image_query) return;

    const requestId = ++requestIdRef.current;

    fetch(`/api/images?query=${encodeURIComponent(location.image_query)}`)
      .then((res) => res.json())
      .then((data: { images?: LocationImage[] }) => {
        if (requestIdRef.current !== requestId) return; // stale — component unmounted/moved on
        setFetchedImages(data.images ?? []);
        setFetchState(data.images && data.images.length > 0 ? "loaded" : "error");
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setFetchedImages([]);
        setFetchState("error");
      });
  }, [location.image_query, location.images]);

  const images = fetchedImages ?? [];

  if (fetchState === "loading") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-foreground-muted">
        <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
        <span>Loading photos…</span>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-foreground-muted">
        <ImageOff className="h-6 w-6 text-foreground-muted" />
        <span>No images found</span>
        {location.image_query && (
          <span className="max-w-xs text-xs text-foreground-muted/70">
            Try searching &ldquo;{location.image_query}&rdquo; in your browser
          </span>
        )}
      </div>
    );
  }

  const current = images[Math.min(index, images.length - 1)];

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden rounded-lg bg-neutral-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.url}
        alt={current.title.replace(/^File:/, "").replace(/\.[a-zA-Z0-9]+$/, "")}
        className="h-full w-full object-cover"
      />

      {/* Attribution — subtle "i" icon in the corner, revealed on hover/focus, per the required-but-not-cluttering spec */}
      <div
        className="absolute right-2 top-2 z-10"
        onMouseEnter={() => setShowAttribution(true)}
        onMouseLeave={() => setShowAttribution(false)}
      >
        <button
          type="button"
          onClick={() => setShowAttribution((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
          aria-label="Photo attribution"
        >
          <Info className="h-3.5 w-3.5" />
        </button>

        {showAttribution && (
          <div className="absolute right-0 top-8 w-56 rounded-lg border border-border bg-surface p-3 text-xs shadow-lg">
            {current.author && (
              <div className="text-foreground">{current.author}</div>
            )}
            {current.license && (
              <div className="mt-0.5 text-foreground-muted">{current.license}</div>
            )}
            <a
              href={current.filePageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-foreground-muted underline underline-offset-2 hover:text-foreground"
            >
              View on Wikimedia Commons
            </a>
          </div>
        )}
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
          className="flex h-6 w-6 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
          aria-label="Previous photo"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-9 text-center font-mono text-xs text-white">
          {String(index + 1).padStart(2, "0")}/{String(images.length).padStart(2, "0")}
        </span>
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % images.length)}
          className="flex h-6 w-6 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
          aria-label="Next photo"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}