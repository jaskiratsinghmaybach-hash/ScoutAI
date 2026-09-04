import { NextRequest, NextResponse } from "next/server";
import { filterToRealLocations } from "@/lib/agent";
import { getScoutRun, pushStep, updateScoutRun, markScoutRunError } from "@/lib/scoutRunStore";
import { triggerStageInBackground } from "@/lib/triggerStage";
import { requireInternalStageSecret } from "@/lib/internalAuth";

// Stage 4 — verify each candidate is a real, findable place (was Step
// 4). Runs one verification search per candidate in parallel, then one
// batched Gemini call to judge all of them — same as before, just its
// own invocation now.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authError = requireInternalStageSecret(req);
  if (authError) return authError;

  const { runId } = (await req.json()) as { runId: string };

  const run = await getScoutRun(runId);
  if (!run) {
    console.error(`[stage-4] run ${runId} not found`);
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (!run.candidate_locations) {
    const message = "Stage 4 ran before stage 3's candidate_locations were written";
    console.error(`[stage-4] run ${runId}:`, message);
    await markScoutRunError(runId, message);
    return NextResponse.json({ error: message }, { status: 409 });
  }

  try {
    let steps = await pushStep(runId, run.steps, {
      step: 4,
      action: "Verifying locations are real",
      detail: `Confirming ${run.candidate_locations.length} locations actually exist...`,
      status: "running",
    });

    const locations = await filterToRealLocations(run.candidate_locations);
    const droppedCount = run.candidate_locations.length - locations.length;

    steps = await pushStep(runId, steps, {
      step: 4,
      action: "Verifying locations are real",
      detail:
        droppedCount > 0
          ? `Confirmed ${locations.length}/${run.candidate_locations.length} — dropped ${droppedCount} unverified`
          : `All ${locations.length} locations confirmed real`,
      status: "done",
    });

    await updateScoutRun(runId, { locations });

    triggerStageInBackground(req, "/api/scout/stage-5", { runId }, runId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stage 4 failed";
    console.error(`[stage-4] run ${runId} failed:`, err);
    await markScoutRunError(runId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
