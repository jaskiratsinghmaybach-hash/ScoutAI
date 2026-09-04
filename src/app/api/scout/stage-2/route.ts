import { NextRequest, NextResponse } from "next/server";
import { runSearches } from "@/lib/agent";
import { getScoutRun, pushStep, updateScoutRun, markScoutRunError } from "@/lib/scoutRunStore";
import { triggerStageInBackground } from "@/lib/triggerStage";

// Stage 2 — run all searches via Parallel (was Step 2). Runs the N
// searches concurrently (same Promise.all as before inside
// runSearches), well under 60s for a handful of queries.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { runId } = (await req.json()) as { runId: string };

  const run = await getScoutRun(runId);
  if (!run) {
    console.error(`[stage-2] run ${runId} not found`);
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (!run.search_queries) {
    const message = "Stage 2 ran before stage 1's search_queries were written";
    console.error(`[stage-2] run ${runId}:`, message);
    await markScoutRunError(runId, message);
    return NextResponse.json({ error: message }, { status: 409 });
  }

  try {
    let steps = await pushStep(runId, run.steps, {
      step: 2,
      action: "Searching for real locations",
      detail: `Running ${run.search_queries.length} searches via Parallel...`,
      status: "running",
    });

    const searchResults = await runSearches(run.search_queries);

    steps = await pushStep(runId, steps, {
      step: 2,
      action: "Searching for real locations",
      detail: "Retrieved permit data, productions history, and cost signals",
      status: "done",
    });

    await updateScoutRun(runId, { search_results: searchResults });

    triggerStageInBackground(req, "/api/scout/stage-3", { runId }, runId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stage 2 failed";
    console.error(`[stage-2] run ${runId} failed:`, err);
    await markScoutRunError(runId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
