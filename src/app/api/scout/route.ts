import { NextRequest, NextResponse } from "next/server";
import type { SceneQuery } from "@/types";
import { createScoutRun } from "@/lib/scoutRunStore";
import { triggerStageInBackground } from "@/lib/triggerStage";

// This route no longer does any pipeline work itself, and no longer
// streams a response. It just validates the request, creates a
// scout_runs row, fires stage-1 in the background (without awaiting
// it), and returns the runId immediately. The client then polls (or
// subscribes to) that row via Supabase for progress — see
// GET /api/scout/[runId].
//
// Why: the previous version ran all 5 pipeline steps sequentially
// inside ONE invocation of this route, all counted against the same
// maxDuration window. On Vercel Hobby that window is a hard 60s
// ceiling that cannot be raised — so a pipeline whose total wall-clock
// time (queries + 2 Gemini calls + N parallel searches + verification
// + reasoning) exceeded 60s would get killed by Vercel regardless of
// how the work was internally organized, AS LONG AS one invocation
// was still awaiting all of it. Splitting into stage-a/b/c/d helper
// functions that this route AWAITED did not fix that — the parent's
// clock kept running the whole time. The actual fix is this route
// (and every stage after it) never running longer than ITS OWN slice
// of work, and handing off the rest via a fire-and-forget trigger.
export const runtime = "nodejs";
export const maxDuration = 60; // now only needs to cover this route's own (near-instant) work

export async function POST(req: NextRequest) {
  const query: SceneQuery = await req.json();

  if (!query.description || query.description.trim().length < 10) {
    return NextResponse.json(
      { error: "Scene description too short or vague. Give more detail." },
      { status: 400 }
    );
  }

  let runId: string;
  try {
    runId = await createScoutRun(query);
  } catch (err) {
    console.error("Failed to create scout run:", err);
    return NextResponse.json({ error: "Failed to start scout run." }, { status: 500 });
  }

  triggerStageInBackground(req, "/api/scout/stage-1", { runId }, runId);

  return NextResponse.json({ runId });
}
