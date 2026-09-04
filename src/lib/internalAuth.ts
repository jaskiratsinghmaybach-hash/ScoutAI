/**
 * internalAuth.ts
 *
 * The scout pipeline is split into stage-1..stage-5 routes so each one
 * stays under Vercel's per-invocation duration limit (see
 * triggerStage.ts for the full rationale). Each stage is a normal
 * public Next.js route, though — Vercel's deployment-level auth only
 * gates the deployment itself, not individual API routes within it.
 * With that off (required so the app is actually reachable by
 * visitors), anyone who finds a stage URL could POST to it directly,
 * skipping /api/scout entirely, and run Gemini/Parallel calls on this
 * project's own API keys for free.
 *
 * requireInternalStageSecret() closes that: every stage route calls
 * this first, before touching Gemini, Parallel, or Supabase. Only
 * requests carrying the shared secret (set via triggerStageInBackground,
 * which only this deployment's own server-side code can construct) get
 * through. External requests get a 401 with zero work done.
 */

import { NextRequest, NextResponse } from "next/server";

export function requireInternalStageSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_STAGE_SECRET;

  // Fail closed: if the secret isn't configured, refuse rather than
  // silently running unprotected. Set INTERNAL_STAGE_SECRET in the
  // Vercel project's Environment Variables (any long random string).
  if (!expected) {
    console.error("[internalAuth] INTERNAL_STAGE_SECRET is not set — refusing request");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const provided = req.headers.get("x-internal-stage-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  return null; // ok, caller proceeds
}
