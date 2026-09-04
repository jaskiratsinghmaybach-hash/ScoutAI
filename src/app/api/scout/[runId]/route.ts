import { NextRequest, NextResponse } from "next/server";
import { getScoutRun } from "@/lib/scoutRunStore";

// GET /api/scout/[runId] — the client polls this instead of holding a
// long-lived SSE connection open. Returns the same shape the old SSE
// "step" and "complete"/"error" events carried, so ScoutApp.tsx's
// existing state updates (setRuns, setPhase, etc.) need only a
// different transport, not different handling logic.
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const run = await getScoutRun(runId);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: run.status,
    steps: run.steps,
    packet: run.packet,
    error: run.error,
  });
}
