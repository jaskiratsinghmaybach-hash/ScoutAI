import { NextRequest } from "next/server";
import { genAI, generateWithRetry } from "@/lib/agent";
import type { Location, CardChatResponse } from "@/types";

export const runtime = "nodejs";

/**
 * Handles a chat message sent with a card attached (via "Add to chat"
 * or a suggestion chip). One Gemini call does two jobs at once:
 *
 * 1. Classify the user's intent — do they want MORE locations similar
 *    to the referenced card ("similar"), or are they asking a
 *    question ABOUT the referenced card that a direct answer can
 *    satisfy without changing the cards on screen ("answer")?
 * 2. Depending on which: either write a ready-to-use refinement
 *    context string (for the client to pass straight into the
 *    existing /api/scout pipeline as priorContext — no new pipeline
 *    logic needed, that mechanism already exists and already handles
 *    "this is a refinement" framing), or answer the question directly
 *    using the full attached card data as context.
 *
 * Kept as ONE Gemini call (not classify-then-answer as two separate
 * calls) to keep this fast — it's meant to feel like a normal chat
 * reply, not a second pipeline run.
 */
function formatLocation(loc: Location): string {
  return `Name: ${loc.name}
City/Country: ${loc.city}, ${loc.country}
Score: ${loc.score}/100
Mood fit: ${loc.mood_match}
Era fit: ${loc.era_match}
Scene/setting: ${loc.scene_description}
Permit info: ${loc.permit_info}${loc.permit_url ? ` (${loc.permit_url})` : ""}
Est. daily cost: ${loc.avg_daily_cost}
Weather notes: ${loc.weather_notes}
Logistics notes: ${loc.logistics_notes}
Past productions: ${loc.past_productions?.join(", ") || "none listed"}`;
}

export async function POST(req: NextRequest) {
  let body: {
    message?: string;
    scope?: "single" | "all";
    locations?: Location[];
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { message, scope, locations } = body;

  if (!message || !message.trim()) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }
  if (!locations || locations.length === 0 || !scope) {
    return Response.json(
      { error: "scope and at least one location are required" },
      { status: 400 },
    );
  }

  const locationsBlock = locations
    .map((loc, i) => `LOCATION ${i + 1}:\n${formatLocation(loc)}`)
    .join("\n\n");

  const prompt = `You are Scout, a film location scouting assistant. The user has attached ${
    scope === "single" ? "one specific location" : "all currently shown locations"
  } to their message as context, then asked:

"${message}"

ATTACHED LOCATION${locations.length > 1 ? "S" : ""}:
${locationsBlock}

Decide the user's intent:
- "similar" — they want you to go find MORE locations like the attached one(s) (e.g. "find me more like this", "show similar spots", "something cheaper but the same vibe").
- "answer" — they're asking a question ABOUT the attached location(s) that you can answer directly from the data above, without running a new search (e.g. "what's the parking like", "is this good for a rainy scene", "how do the budgets compare").

Respond with ONLY a JSON object, no other text, in this exact shape:

If intent is "similar":
{"intent": "similar", "refinement_context": "<a concise paragraph summarizing what the user liked about the attached location(s) and what they're asking for now, written so it can be dropped directly into a new search as refinement context — e.g. 'User wants more locations similar to [name], a [description]. They are specifically asking for: [their request].'>"}

If intent is "answer":
{"intent": "answer", "answer": "<a direct, concise, conversational answer to their question using ONLY the data provided above — 2-4 sentences, no fluff, no 'I hope this helps', just the facts. If the data above doesn't actually contain what they're asking, say so plainly rather than guessing.>"}`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const text = await generateWithRetry(model, prompt);
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<CardChatResponse>;

    if (parsed.intent === "similar" && parsed.refinement_context) {
      return Response.json({
        intent: "similar",
        refinement_context: parsed.refinement_context,
      } satisfies CardChatResponse);
    }

    if (parsed.intent === "answer" && parsed.answer) {
      return Response.json({
        intent: "answer",
        answer: parsed.answer,
      } satisfies CardChatResponse);
    }

    // Malformed/incomplete response — fail toward the safer, cheaper
    // path (a direct answer) rather than silently triggering a new
    // full pipeline run the user didn't clearly ask for.
    console.error("card-chat: unexpected model response shape:", parsed);
    return Response.json({
      intent: "answer",
      answer:
        "I wasn't able to work out a clear answer from that — could you rephrase your question about this location?",
    } satisfies CardChatResponse);
  } catch (err) {
    console.error("card-chat error:", err);
    return Response.json(
      { error: "Something went wrong processing that message." },
      { status: 500 },
    );
  }
}