import { NextRequest } from "next/server";
import { genAI, generateWithRetry } from "@/lib/agent";
import type { Location } from "@/types";

export const runtime = "nodejs";

/**
 * Generates 2-3 short, specific suggested questions for ONE location —
 * powers the "Suggestions" dropdown under "Add to chat" on the card UI.
 * Deliberately narrower/more specific than /api/broad-suggestions
 * (which covers all 4 cards at once) — these are meant to read like
 * "budget", "vibe/feel" style quick-taps a filmmaker would actually
 * want answered about THIS one place.
 */
export async function POST(req: NextRequest) {
  let body: { location?: Location };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { location } = body;
  if (!location) {
    return Response.json({ error: "location is required" }, { status: 400 });
  }

  const prompt = `You are helping a filmmaker quickly explore a scouted film location. Given this location's data, write exactly 3 short suggested questions (each under 8 words) a filmmaker would plausibly want to tap to learn more — specific to THIS location's actual details, not generic. Cover different angles (e.g. one about budget/cost, one about mood/vibe fit, one about logistics/permits/timing) rather than three similar questions.

LOCATION:
Name: ${location.name}
City/Country: ${location.city}, ${location.country}
Mood fit: ${location.mood_match}
Era fit: ${location.era_match}
Scene/setting: ${location.scene_description}
Permit info: ${location.permit_info}
Est. daily cost: ${location.avg_daily_cost}
Weather notes: ${location.weather_notes}
Logistics notes: ${location.logistics_notes}

Respond with ONLY a JSON array of exactly 3 short question strings, nothing else. Example: ["What's the actual daily cost breakdown?", "Does this fit a moody night scene?", "Any permit restrictions for weekends?"]`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const text = await generateWithRetry(model, prompt);
    const cleaned = text.replace(/```json|```/g, "").trim();
    const suggestions = JSON.parse(cleaned) as unknown;

    if (!Array.isArray(suggestions) || suggestions.some((s) => typeof s !== "string")) {
      console.error("card-suggestions: unexpected shape:", suggestions);
      return Response.json({ suggestions: [] });
    }

    return Response.json({ suggestions: suggestions.slice(0, 3) });
  } catch (err) {
    console.error("card-suggestions error:", err);
    // Fails to an empty list rather than an error the UI has to
    // specially handle — the dropdown just shows nothing to pick.
    return Response.json({ suggestions: [] });
  }
}