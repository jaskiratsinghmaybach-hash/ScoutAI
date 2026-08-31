"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import type { Location } from "@/types";

/**
 * KNOWN GAP: `Location` currently has no image/photo field — only
 * `image_query` (a search string, not an actual image). There is no
 * real photo data to display yet; this is a backend/pipeline gap
 * (image-fetching via Parallel or another source), not something this
 * component can wire around. Built so that wiring in a real
 * `images: string[]` field later requires touching only the `images`
 * line below — the counter, nav arrows, and empty state are already
 * driven by a real array length, never a hardcoded number.
 */
export function ImageryTab({ location }: { location: Location }) {
  // No image field exists on Location yet — see gap note above.
  const images: string[] = [];
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-foreground-muted">
        <ImageOff className="h-6 w-6 text-foreground-muted" />
        <span>No imagery available yet</span>
        {location.image_query && (
          <span className="max-w-xs text-xs text-foreground-muted/70">
            Search reference: &ldquo;{location.image_query}&rdquo;
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden rounded-lg bg-neutral-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[index]}
        alt={`${location.name} — photo ${index + 1}`}
        className="h-full w-full object-cover"
      />
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
          className="flex h-6 w-6 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
          aria-label="Previous photo"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[36px] text-center font-mono text-xs text-white">
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