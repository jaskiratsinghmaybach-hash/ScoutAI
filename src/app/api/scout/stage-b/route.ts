import { NextRequest, NextResponse } from "next/server";
import { synthesizeLocations } from "@/lib/agent";
import type { SceneQuery } from "@/types";

// Stage B — the original Step 3 (Gemini synthesizes search results into
// structured location candidates). This is the single heaviest call in
// the whole pipeline (large structured JSON output), so it gets its own
// invocation rather than being bundled with anything else — keeping it
// alone maximizes the chance it finishes well within 60s even on a slow
// Gemini response, and isolates it from stage-a/stage-c/stage-d's own
// time budgets.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { query, searchResults } = (await req.json()) as {
    query: SceneQuery;
    searchResults: Record<string, string>;
  };

  const candidateLocations = await synthesizeLocations(query, searchResults);

  return NextResponse.json({ candidateLocations });
}
