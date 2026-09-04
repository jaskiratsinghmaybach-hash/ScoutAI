import { NextRequest, NextResponse } from "next/server";
import { generateSearchQueries, runSearches } from "@/lib/agent";
import { getScoutRun, pushStep, updateScoutRun, markScoutRunError } from "@/lib/scoutRunStore";
import { triggerStageInBackground } from "@/lib/triggerStage";
import { requireInternalStageSecret } from "@/lib/internalAuth";

// Stage 1 — generates search queries and runs searches (Steps 1 & 2).
// Combining Steps 1 and 2 (~4-6s total) keeps each stage well under Vercel's
// 60s maxDuration while reducing internal proxy hops so the pipeline stays
// safely beneath Vercel's 508 infinite loop detection threshold.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authError = requireInternalStageSecret(req);
  if (authError) return authError;

  const { runId } = (await req.json()) as { runId: string };

  const run = await getScoutRun(runId);
  if (!run) {
    console.error(`[stage-1] run ${runId} not found`);
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  try {
    let steps = await pushStep(runId, run.steps, {
      step: 1,
      action: "Analyzing scene requirements",
      detail: "Gemini is parsing your scene for location criteria...",
      status: "running",
    });

    const searchQueries = await generateSearchQueries(run.query);

    steps = await pushStep(runId, steps, {
      step: 1,
      action: "Analyzing scene requirements",
      detail: `Generated ${searchQueries.length} targeted search queries`,
      status: "done",
    });

    await updateScoutRun(runId, { search_queries: searchQueries });

    // Step 2: Run searches in parallel
    steps = await pushStep(runId, steps, {
      step: 2,
      action: "Searching for real locations",
      detail: `Running ${searchQueries.length} searches via Parallel...`,
      status: "running",
    });

    const searchResults = await runSearches(searchQueries);

    await pushStep(runId, steps, {
      step: 2,
      action: "Searching for real locations",
      detail: "Retrieved permit data, productions history, and cost signals",
      status: "done",
    });

    await updateScoutRun(runId, { search_results: searchResults });

    // Proceed to Stage 3 (synthesis)
    triggerStageInBackground(req, "/api/scout/stage-3", { runId }, runId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stage 1 failed";
    console.error(`[stage-1] run ${runId} failed:`, err);
    await markScoutRunError(runId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
