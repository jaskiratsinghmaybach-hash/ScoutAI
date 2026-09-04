import { NextRequest, NextResponse } from "next/server";
import { generateSearchQueries } from "@/lib/agent";
import { getScoutRun, pushStep, updateScoutRun, markScoutRunError } from "@/lib/scoutRunStore";
import { triggerStageInBackground } from "@/lib/triggerStage";

// Stage 1 — generate search queries from the scene description (was
// Step 1 in the old single-invocation runScoutAgent). Its own
// maxDuration window only has to cover ONE Gemini call, comfortably
// under 60s, then it hands off to stage-2 and returns.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
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

    triggerStageInBackground(req, "/api/scout/stage-2", { runId }, runId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stage 1 failed";
    console.error(`[stage-1] run ${runId} failed:`, err);
    await markScoutRunError(runId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
