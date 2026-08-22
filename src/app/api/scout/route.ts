import { NextRequest } from "next/server";
import { runScoutAgent } from "@/lib/agent";
import type { SceneQuery, AgentStep } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const onStep = (step: AgentStep) => {
          if (clientAborted) return;
          send({ type: "step", step });
        };

        const packet = await runScoutAgent(query, onStep);
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
