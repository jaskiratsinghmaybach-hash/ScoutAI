import { NextRequest, NextResponse } from "next/server";
import { generateReasoning } from "@/lib/agent";
import type { SceneQuery, Location } from "@/types";

// Stage D — the original Step 5 (Gemini writes the final reasoning
// summary). Lightest of the four stages on its own, but still split
// out rather than folded into stage-c so that a slow verification
// batch in stage-c never eats into this call's own budget.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { query, locations } = (await req.json()) as {
    query: SceneQuery;
    locations: Location[];
  };

  const reasoning = await generateReasoning(query, locations);

  return NextResponse.json({ reasoning });
}
