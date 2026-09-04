import { NextRequest } from "next/server";
import type { SceneQuery, AgentStep, ScoutingPacket, Location } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Determines the origin to call the sibling stage-a/b/c/d routes on.
// Vercel sets VERCEL_URL automatically at runtime (host only, no
// scheme) for every deployment — production, preview, and branch
// deploys alike — so this needs no manual configuration there. Locally
// (npm run dev, or the ngrok setup covered separately) there's no
// VERCEL_URL, so it falls back to localhost on the dev server's own
// port.
function internalOrigin(req: NextRequest): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return req.nextUrl.origin;
}

async function callStage<T>(
  origin: string,
  stage: "stage-a" | "stage-b" | "stage-c" | "stage-d",
  body: object,
): Promise<T> {
  const res = await fetch(`${origin}/api/scout/${stage}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${stage} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  const query: SceneQuery = await req.json();
  let clientAborted = false;
  req.signal.addEventListener("abort", () => {
    clientAborted = true;
  });

  if (!query.description || query.description.trim().length < 10) {
    return new Response(
      JSON.stringify({ error: "Scene description too short or vague. Give more detail." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const origin = internalOrigin(req);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const onStep = (step: AgentStep) => {
        if (clientAborted) return;
        send({ type: "step", step });
      };

      try {
        // The 5-step pipeline is split across four separate serverless
        // invocations (stage-a through stage-d) instead of running
        // in-process here. Each stage gets its own fresh 60s Vercel
        // function budget, so the pipeline's total wall-clock time can
        // exceed 60s overall without any single stage exceeding it —
        // this route just relays progress/results between them over
        // the same SSE stream the client already expects, so nothing
        // about the client-side handling changes.

        // Step 1 + 2 — stage-a
        onStep({
          step: 1,
          action: "Analyzing scene requirements",
          detail: "Gemini is parsing your scene for location criteria...",
          status: "running",
        });
        const { searchQueries, searchResults } = await callStage<{
          searchQueries: string[];
          searchResults: Record<string, string>;
        }>(origin, "stage-a", query);
        onStep({
          step: 1,
          action: "Analyzing scene requirements",
          detail: `Generated ${searchQueries.length} targeted search queries`,
          status: "done",
        });
        onStep({
          step: 2,
          action: "Searching for real locations",
          detail: `Running ${searchQueries.length} searches via Parallel...`,
          status: "running",
        });
        onStep({
          step: 2,
          action: "Searching for real locations",
          detail: "Retrieved permit data, productions history, and cost signals",
          status: "done",
        });

        // Step 3 — stage-b
        onStep({
          step: 3,
          action: "Scouting and ranking locations",
          detail: "Gemini is synthesizing research into scouting packets...",
          status: "running",
        });
        const { candidateLocations } = await callStage<{
          candidateLocations: Location[];
        }>(origin, "stage-b", { query, searchResults });
        onStep({
          step: 3,
          action: "Scouting and ranking locations",
          detail: `Found ${candidateLocations.length} candidate locations`,
          status: "done",
        });

        // Step 4 — stage-c
        onStep({
          step: 4,
          action: "Verifying locations are real",
          detail: `Confirming ${candidateLocations.length} locations actually exist...`,
          status: "running",
        });
        const { locations } = await callStage<{ locations: Location[] }>(
          origin,
          "stage-c",
          { candidateLocations },
        );
        const droppedCount = candidateLocations.length - locations.length;
        onStep({
          step: 4,
          action: "Verifying locations are real",
          detail:
            droppedCount > 0
              ? `Confirmed ${locations.length}/${candidateLocations.length} — dropped ${droppedCount} unverified`
              : `All ${locations.length} locations confirmed real`,
          status: "done",
        });

        // Step 5 — stage-d
        onStep({
          step: 5,
          action: "Writing scout's report",
          detail: "Generating professional reasoning summary...",
          status: "running",
        });
        const { reasoning } = await callStage<{ reasoning: string }>(
          origin,
          "stage-d",
          { query, locations },
        );
        onStep({
          step: 5,
          action: "Writing scout's report",
          detail: "Scouting packet complete",
          status: "done",
        });

        const packet: ScoutingPacket = {
          query,
          locations,
          agent_reasoning: reasoning,
          generated_at: new Date().toISOString(),
          narrowing_note:
            locations.length < candidateLocations.length
              ? locations.length === 0
                ? "These search requirements are too niche to confirm any real filming locations — try broadening the scene, mood, or region."
                : "These search requirements are too niche to confirm more real filming locations — showing only the ones that could be verified."
              : undefined,
        };

        if (!clientAborted) {
          send({ type: "complete", packet });
        }
      } catch (err) {
        console.error("Agent pipeline error:", err);
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Agent pipeline failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

