import { NextRequest } from "next/server";
import { genAI, generateWithRetry } from "@/lib/agent";
import type { Location } from "@/types";

export const runtime = "nodejs";

/**
 * Generates 2-3 broad suggested questions/requests that span ALL
 * currently shown locations — powers the suggestion chips above the
 * message box, shown only while cards are on screen. Deliberately
 * comparative/broad (e.g. "compare budgets across these",
 * "which has the easiest permits") rather than about any single card —
 * that's what /api/card-suggestions is for.
 */
export async function POST(req: NextRequest) {
  let body: { locations?: Location[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { locations } = body;
  if (!locations || locations.length === 0) {
    return Response.json({ error: "locations is required" }, { status: 400 });
  }

  const locationsBlock = locations
    .map(
      (loc, i) =>
        `${i + 1}. ${loc.name} (${loc.city}, ${loc.country}) — score ${loc.score}/100, cost: ${loc.avg_daily_cost}`,
    )
    .join("\n");

  const prompt = `You are helping a filmmaker who is looking at ${locations.length} scouted film locations together. Write exactly 2-3 short suggested questions/requests (each under 8 words) that make sense across ALL of them — comparative or broad, not about any single one. Examples of the RIGHT kind of thing: "Compare permit difficulty across these", "Which fits a low budget best?", "Find me more like these".

LOCATIONS:
${locationsBlock}

Respond with ONLY a JSON array of 2-3 short strings, nothing else. Example: ["Compare budgets across these", "Which has the best permits?", "Find more like these"]`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const text = await generateWithRetry(model, prompt);
    const cleaned = text.replace(/```json|```/g, "").trim();
    const suggestions = JSON.parse(cleaned) as unknown;

    if (!Array.isArray(suggestions) || suggestions.some((s) => typeof s !== "string")) {
      console.error("broad-suggestions: unexpected shape:", suggestions);
      return Response.json({ suggestions: [] });
    }

    return Response.json({ suggestions: suggestions.slice(0, 3) });
  } catch (err) {
    console.error("broad-suggestions error:", err);
    return Response.json({ suggestions: [] });
  }
}