"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { shortenUrl, sourceNameFromUrl } from "../location-card-utils";
import type { Location } from "@/types";

/**
 * KNOWN GAP: `search_sources` on `Location` is currently just
 * `string[]` — bare URLs, no title or "why this source" metadata. The
 * product owner's spec explicitly wants title + reason per source;
 * that richer shape doesn't exist in the pipeline yet (flagged for the
 * Parallel integration / scout pipeline to return `{ url, title?,
 * reason? }` instead of a bare string). This component is built to
 * accept and display that richer shape the moment it exists — see
 * `normalizeSource` below — and degrades to "URL only" per source in
 * the meantime, never inventing a title or reason.
 */
type SourceEntry = { url: string; title?: string; reason?: string };

function normalizeSource(raw: string | SourceEntry): SourceEntry {
  if (typeof raw === "string") return { url: raw };
  return raw;
}

function SourceRow({ source }: { source: SourceEntry }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(source.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail (permissions, insecure context) — non-fatal,
      // just leave the button in its normal state.
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">
            {sourceNameFromUrl(source.url)}
          </div>
          {source.title && (
            <div className="mt-0.5 truncate text-xs text-foreground-muted">
              {source.title}
            </div>
          )}
        </div>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-foreground-muted transition-colors hover:text-foreground"
          aria-label="Open source"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <span className="truncate font-mono text-xs text-foreground-muted">
          {shortenUrl(source.url)}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground-muted transition-colors hover:bg-neutral-800 hover:text-foreground"
          aria-label="Copy full URL"
        >
          {copied ? (
            <Check className="h-3 w-3 text-success" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>

      {source.reason ? (
        <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
          {source.reason}
        </p>
      ) : (
        <p className="mt-2 text-xs italic leading-relaxed text-foreground-muted/60">
          Source detail not available yet
        </p>
      )}
    </div>
  );
}

export function SourcesTab({ location }: { location: Location }) {
  const sources = (location.search_sources ?? []).map(normalizeSource);

  if (sources.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-foreground-muted">
        <span>No sources recorded for this location yet</span>
      </div>
    );
  }

  return (
    <div className="h-full space-y-2.5 px-1 py-1">
      {sources.map((source, i) => (
        <SourceRow key={`${source.url}-${i}`} source={source} />
      ))}
    </div>
  );
}