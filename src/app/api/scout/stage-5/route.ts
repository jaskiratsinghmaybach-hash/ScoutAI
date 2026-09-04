import { NextRequest, NextResponse } from "next/server";
import { generateReasoning } from "@/lib/agent";
import { getScoutRun, pushStep, updateScoutRun, markScoutRunError } from "@/lib/scoutRunStore";
import type { ScoutingPacket } from "@/types";
import { requireInternalStageSecret } from "@/lib/internalAuth";

// Stage 5 — generate the agent reasoning summary and assemble the
// final ScoutingPacket (was Step 5). Last stage: writes packet + sets
// status "done" instead of triggering anything further.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authError = requireInternalStageSecret(req);
  if (authError) return authError;

  const { runId } = (await req.json()) as { runId: string };

  const run = await getScoutRun(runId);
  if (!run) {
    console.error(`[stage-5] run ${runId} not found`);
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (!run.locations || !run.candidate_locations) {
    const message = "Stage 5 ran before stage 4's locations were written";
    console.error(`[stage-5] run ${runId}:`, message);
    await markScoutRunError(runId, message);
    return NextResponse.json({ error: message }, { status: 409 });
  }

  try {
    const steps = await pushStep(runId, run.steps, {
      step: 5,
      action: "Writing scout's report",
      detail: "Generating professional reasoning summary...",
      status: "running",
    });

    const reasoning = await generateReasoning(run.query, run.locations);

    await pushStep(runId, steps, {
      step: 5,
      action: "Writing scout's report",
      detail: "Scouting packet complete",
      status: "done",
    });

    const packet: ScoutingPacket = {
      query: run.query,
      locations: run.locations,
      agent_reasoning: reasoning,
      generated_at: new Date().toISOString(),
      narrowing_note:
        run.locations.length < run.candidate_locations.length
          ? run.locations.length === 0
            ? "These search requirements are too niche to confirm specific site details — try broadening the scene, mood, or region."
            : "Showing only the locations with fully confirmed site and accessibility data."
          : undefined,
    };

    await updateScoutRun(runId, { packet, status: "done" });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stage 5 failed";
    console.error(`[stage-5] run ${runId} failed:`, err);
    await markScoutRunError(runId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
