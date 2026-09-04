/**
 * triggerStage.ts
 *
 * Fires the next pipeline stage WITHOUT awaiting its completion. This
 * is the core trick that keeps the scout pipeline under Vercel's 60s
 * function limit on Hobby: each stage's HTTP request returns as soon
 * as ITS OWN work is done, after kicking off the next stage in the
 * background — instead of one parent request awaiting all 5 stages
 * sequentially inside a single continuously-billed invocation.
 *
 * Uses Next.js's `after()` (via the internal fetch itself running as
 * a detached promise) so the current invocation doesn't get frozen or
 * killed by the platform the instant it sends its response — see
 * https://nextjs.org/docs/app/api-reference/functions/after.
 */

import { after } from "next/server";
import type { NextRequest } from "next/server";

// Vercel sets VERCEL_URL (host only, no scheme) automatically for
// every deployment — prod, preview, and branch alike. Locally there's
// no VERCEL_URL, so fall back to the incoming request's own origin
// (works for `next dev` on any port).
export function internalOrigin(req: NextRequest): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return req.nextUrl.origin;
}

/**
 * Schedules a POST to another internal stage route after the current
 * response has been sent, and does not wait for that stage to finish.
 * Errors from the triggered stage are its own responsibility to write
 * to the scout_runs row (via markScoutRunError) — this function only
 * guarantees the trigger fetch itself is *attempted*; network-level
 * failures to even reach the next stage are logged here as a
 * last-resort safety net.
 */
export function triggerStageInBackground(
  req: NextRequest,
  stagePath: string,
  body: object,
  runId: string
): void {
  const origin = internalOrigin(req);
  after(async () => {
    try {
      const res = await fetch(`${origin}${stagePath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[triggerStage] ${stagePath} responded ${res.status} for run ${runId}:`, text.slice(0, 500));
      }
    } catch (err) {
      console.error(`[triggerStage] failed to reach ${stagePath} for run ${runId}:`, err);
    }
  });
}
