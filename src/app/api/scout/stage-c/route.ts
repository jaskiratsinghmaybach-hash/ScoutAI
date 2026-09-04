import { NextRequest, NextResponse } from "next/server";
import { filterToRealLocations } from "@/lib/agent";
import type { Location } from "@/types";

// Stage C — the original Step 4 (verify each candidate is a real,
// findable place: one Parallel search per candidate, run in parallel,
// then one Gemini call judging all of them at once). Kept as its own
// invocation, separate from stage-b's synthesis call, so a slow batch
// of verification searches can't add to synthesis's own time and push
// the combined total past 60s.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { candidateLocations } = (await req.json()) as {
    candidateLocations: Location[];
  };

  const locations = await filterToRealLocations(candidateLocations);

  return NextResponse.json({ locations });
}
