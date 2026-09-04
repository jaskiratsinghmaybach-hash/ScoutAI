import { NextRequest, NextResponse } from "next/server";
import { generateSearchQueries, runSearches } from "@/lib/agent";
import type { SceneQuery } from "@/types";

// Stage A of the split scout pipeline — see /api/scout/route.ts for why
// this is split across multiple routes instead of one long-running
// function. This stage covers the original Step 1 (generate search
// queries) + Step 2 (run those searches via Parallel), each a fast
// operation on its own, bundled into one short-lived invocation with
// its own fresh 60s budget.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const query: SceneQuery = await req.json();

  const searchQueries = await generateSearchQueries(query);
  const searchResults = await runSearches(searchQueries);

  return NextResponse.json({ searchQueries, searchResults });
}
