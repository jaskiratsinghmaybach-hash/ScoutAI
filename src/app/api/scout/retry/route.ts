import { NextRequest, NextResponse } from "next/server";
import {
  getScoutRun,
  updateScoutRun,
  createScoutRun,
  findRecentScoutRun,
} from "@/lib/scoutRunStore";
import { triggerStageInBackground } from "@/lib/triggerStage";
import type { Location, SceneQuery } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Checks if a list of locations contains generic AI placeholders,
 * fake catalog numbers, or entire district/island names rather than real properties.
 */
function containsPlaceholderNames(locs?: Location[] | null): boolean {
  if (!locs || locs.length === 0) return true;
  return locs.some((loc) => {
    const name = (loc.name || "").toLowerCase().trim();
    return (
      name.includes("area v") ||
      name.includes("stockholm area") ||
      name.includes("modern minimalist villa on") ||
      name.includes("the charred house") ||
      name.includes("architect-designed waterfront retreat") ||
      name.includes("nordic glass residence") ||
      name === "stora essingen" ||
      name.length < 3
    );
  });
}

/**
 * Checks if Parallel search results contain real, meaningful web excerpts.
 */
function hasValidSearchResults(results?: Record<string, string> | null): boolean {
  if (!results) return false;
  const entries = Object.values(results);
  if (entries.length === 0) return false;
  const valid = entries.filter(
    (text) => text && text.trim().length > 30 && !text.includes("Search unavailable.")
  );
  return valid.length > 0;
}

export async function POST(req: NextRequest) {
  try {
    const { runId, query, forceFresh } = (await req.json()) as {
      runId?: string;
      query?: SceneQuery;
      forceFresh?: boolean;
    };

    let run = runId ? await getScoutRun(runId) : null;
    if (!run && query?.description) {
      run = await findRecentScoutRun(query.description);
    }

    // Case 1: Fresh run requested or no prior run found
    if (forceFresh && run) {
      console.log(`[retry] forceFresh requested for run ${run.id}. Restarting from Stage 1.`);
      await updateScoutRun(run.id, {
        search_queries: null,
        search_results: null,
        candidate_locations: null,
        locations: null,
        packet: null,
        error: null,
        status: "running",
        current_step: 1,
        steps: [
          {
            step: 1,
            action: "Analyzing scene requirements",
            detail: "Starting fresh research with strict real-world property criteria...",
            status: "running",
          },
        ],
      });
      triggerStageInBackground(req, "/api/scout/stage-1", { runId: run.id }, run.id);
      return NextResponse.json({ ok: true, runId: run.id, restartedFrom: "stage-1" });
    }

    if (!run && query?.description) {
      const newRunId = await createScoutRun(query);
      triggerStageInBackground(req, "/api/scout/stage-1", { runId: newRunId }, newRunId);
      return NextResponse.json({ ok: true, runId: newRunId, restartedFrom: "stage-1" });
    }

    if (!run) {
      return NextResponse.json(
        { error: "Could not find run to retry and no query was provided." },
        { status: 400 }
      );
    }

    // Case 2: Intelligent Step-Back Retry
    // We inspect previous step outputs to ensure the next step has verified,
    // high-quality data (no placeholders, no empty sets). If data from
    // the previous step is invalid or placeholder, we step back even further.

    // Check if candidate_locations from Stage 3 are real and valid
    const hasValidCandidates =
      Boolean(run.candidate_locations && run.candidate_locations.length > 0) &&
      !containsPlaceholderNames(run.candidate_locations);

    // Check if search results from Stage 2 are valid from Parallel
    const hasValidSearchData = hasValidSearchResults(run.search_results);

    // Scenario A: Stuck at Step 5 (Report writing) or Step 4 (Verification)
    // Go back 1 step to candidate locations from Stage 3 and re-verify cleanly
    if (hasValidCandidates) {
      console.log(`[retry] Run ${run.id}: candidate locations are valid. Stepping back to Stage 4 to verify real locations.`);
      // Clear downstream verified locations and packet so Stage 4 re-runs cleanly
      await updateScoutRun(run.id, {
        locations: null,
        packet: null,
        error: null,
        status: "running",
      });
      triggerStageInBackground(req, "/api/scout/stage-4", { runId: run.id }, run.id);
      return NextResponse.json({ ok: true, runId: run.id, resumedFrom: "stage-4" });
    }

    // Scenario B: Candidates were placeholders or missing.
    // Step back to Stage 3 if search_results from Parallel are available
    if (hasValidSearchData) {
      console.log(`[retry] Run ${run.id}: search results exist. Stepping back to Stage 3 to re-synthesize real named properties.`);
      await updateScoutRun(run.id, {
        candidate_locations: null,
        locations: null,
        packet: null,
        error: null,
        status: "running",
      });
      triggerStageInBackground(req, "/api/scout/stage-3", { runId: run.id }, run.id);
      return NextResponse.json({ ok: true, runId: run.id, resumedFrom: "stage-3" });
    }

    // Scenario C: Search results are missing, empty, or failed.
    // Step back to Stage 1 to generate targeted discovery queries and re-search
    console.log(`[retry] Run ${run.id}: no valid prior data found. Restarting from Stage 1.`);
    await updateScoutRun(run.id, {
      search_queries: null,
      search_results: null,
      candidate_locations: null,
      locations: null,
      packet: null,
      error: null,
      status: "running",
      current_step: 1,
    });
    triggerStageInBackground(req, "/api/scout/stage-1", { runId: run.id }, run.id);
    return NextResponse.json({ ok: true, runId: run.id, resumedFrom: "stage-1" });
  } catch (err) {
    console.error("[api/scout/retry] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Retry failed" },
      { status: 500 }
    );
  }
}
