"use client";

import { ExternalLink, ShieldAlert } from "lucide-react";
import type { Location } from "@/types";

export function AccessTab({ location }: { location: Location }) {
  const hasPermitInfo =
    location.permit_info && location.permit_info.trim().length > 0;

  return (
    <div className="h-full space-y-4 px-1 py-1">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-foreground-muted" />
          <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
            Permit requirements
          </span>
        </div>
        {hasPermitInfo ? (
          <p className="text-sm leading-relaxed text-foreground">
            {location.permit_info}
          </p>
        ) : (
          <p className="text-sm text-foreground-muted">
            Permit details haven&apos;t been pulled for this location yet.
          </p>
        )}
        {location.permit_url && (
          <a
            href={location.permit_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-foreground underline underline-offset-2 hover:text-foreground-muted"
          >
            Permit office
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}