import { NextRequest, NextResponse } from "next/server";
import { synthesizeLocations } from "@/lib/agent";
import { getScoutRun, pushStep, updateScoutRun, markScoutRunError } from "@/lib/scoutRunStore";
import { triggerStageInBackground } from "@/lib/triggerStage";

// Stage 3 — Gemini synthesizes research into structured location
// packets (was Step 3). One Gemini call over the search context.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { runId } = (await req.json()) as { runId: string };

  const run = await getScoutRun(runId);
  if (!run) {
    console.error(`[stage-3] run ${runId} not found`);
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (!run.search_results) {
    const message = "Stage 3 ran before stage 2's search_results were written";
    console.error(`[stage-3] run ${runId}:`, message);
    await markScoutRunError(runId, message);
    return NextResponse.json({ error: message }, { status: 409 });
  }

  try {
    let steps = await pushStep(runId, run.steps, {
      step: 3,
      action: "Scouting and ranking locations",
      detail: "Gemini is synthesizing research into scouting packets...",
      status: "running",
    });

    const candidateLocations = await synthesizeLocations(run.query, run.search_results);

    steps = await pushStep(runId, steps, {
      step: 3,
      action: "Scouting and ranking locations",
      detail: `Found ${candidateLocations.length} candidate locations`,
      status: "done",
    });

    await updateScoutRun(runId, { candidate_locations: candidateLocations });

    triggerStageInBackground(req, "/api/scout/stage-4", { runId }, runId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stage 3 failed";
    console.error(`[stage-3] run ${runId} failed:`, err);
    await markScoutRunError(runId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
