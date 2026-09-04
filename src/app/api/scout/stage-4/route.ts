import { NextRequest, NextResponse } from "next/server";
import { filterToRealLocations, generateReasoning } from "@/lib/agent";
import { getScoutRun, pushStep, updateScoutRun, markScoutRunError } from "@/lib/scoutRunStore";
import type { ScoutingPacket } from "@/types";
import { requireInternalStageSecret } from "@/lib/internalAuth";

// Stage 4 — verifies locations are real, then generates the final reasoning
// and packet (Steps 4 & 5). Running Step 5 directly here (~2-4s) keeps the total
// runtime well within Vercel's 60s maxDuration while eliminating the 6th nested
// server-to-server hop that triggered Vercel's 508 Loop Detected (INFINITE_LOOP_DETECTED).
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
      action: "Validating site details & accessibility",
      detail: `Cross-referencing site details & accessibility for ${run.candidate_locations.length} locations...`,
      status: "running",
    });

    const locations = await filterToRealLocations(run.candidate_locations);
    const droppedCount = run.candidate_locations.length - locations.length;

    steps = await pushStep(runId, steps, {
      step: 4,
      action: "Validating site details & accessibility",
      detail:
        droppedCount > 0
          ? `Verified ${locations.length}/${run.candidate_locations.length} locations — filtered ${droppedCount} with incomplete site data`
          : `All ${locations.length} locations verified with confirmed site data`,
      status: "done",
    });

    await updateScoutRun(runId, { locations });

    // Step 5: Generate reasoning summary and assemble the final ScoutingPacket.
    steps = await pushStep(runId, steps, {
      step: 5,
      action: "Writing scout's report",
      detail: "Generating professional reasoning summary...",
      status: "running",
    });

    const reasoning = await generateReasoning(run.query, locations);

    await pushStep(runId, steps, {
      step: 5,
      action: "Writing scout's report",
      detail: "Scouting packet complete",
      status: "done",
    });

    const packet: ScoutingPacket = {
      query: run.query,
      locations: locations,
      agent_reasoning: reasoning,
      generated_at: new Date().toISOString(),
      narrowing_note:
        locations.length < run.candidate_locations.length
          ? locations.length === 0
            ? "These search requirements are too niche to confirm specific site details — try broadening the scene, mood, or region."
            : "Showing only the locations with fully confirmed site and accessibility data."
          : undefined,
    };

    await updateScoutRun(runId, { packet, status: "done" });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stage 4 failed";
    console.error(`[stage-4] run ${runId} failed:`, err);
    await markScoutRunError(runId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
