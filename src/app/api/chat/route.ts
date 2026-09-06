import { NextRequest, NextResponse } from "next/server";
import { Type, type Schema } from "@google/genai";
import { generateWithRetry } from "@/lib/agent";
import type { Location, ConversationTurn, SlotState } from "@/types";

export const runtime = "nodejs";

const CHAT_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: ["chat", "scout"],
    },
    chat_reply: {
      type: Type.STRING,
    },
    scout_refinement: {
      type: Type.STRING,
    },
    updated_slots: {
      type: Type.OBJECT,
      properties: {
        description: { type: Type.STRING },
        mood: { type: Type.STRING },
        era: { type: Type.STRING },
        budget: { type: Type.STRING },
        region: { type: Type.STRING },
        duration: { type: Type.STRING },
        requirements: { type: Type.STRING },
      },
    },
  },
  required: ["intent"],
};

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
    history?: ConversationTurn[];
    locations?: Location[];
    slots?: SlotState;
    userName?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, history = [], locations = [], slots, userName } = body;

  if (!message || !message.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const conversationText = history
    .map((turn) => `${turn.role === "user" ? "User" : "ScoutAI"}: ${turn.content}`)
    .join("\n");

  const locationsBlock =
    locations && locations.length > 0
      ? locations
          .map((loc, i) => `--- LOCATION ${i + 1} ---\n${formatLocation(loc)}`)
          .join("\n\n")
      : "No specific locations scouted yet.";

  const prompt = `You are ScoutAI, a professional film location scouting assistant with a warm, confident, knowledgeable personality — like an elite, well-traveled location scout who knows film productions, architecture, permits, and aesthetics inside out.

${userName ? `The user's name is ${userName}. You may address them by name occasionally when it feels natural (e.g. greetings, warm acknowledgments) — but don't force it into every reply. If they ask you directly what their name is or who they are, tell them warmly and clearly that their name is ${userName}.` : ""}

CURRENT SCENE & PROJECT CRITERIA:
- Description: ${slots?.description || "Not specified"}
- Mood: ${slots?.mood || "Not specified"}
- Era: ${slots?.era || "Not specified"}
- Budget: ${slots?.budget || "Not specified"}
- Region: ${slots?.region || "Not specified"}
- Requirements: ${slots?.requirements || "Not specified"}

CURRENTLY SCOUTED LOCATIONS ON SCREEN:
${locationsBlock}

CONVERSATION SO FAR:
${conversationText || "(Start of conversation)"}

LATEST USER MESSAGE:
"${message}"

STEP 1: CLASSIFY USER INTENT INTO EXACTLY ONE OF:
1. "chat" — The user is asking a question, seeking details, or chatting. Examples:
   - Asking about a scouted location (e.g., "What is the full address of Las Rozas?", "Why choose this location?", "Tell me more about the permits", "What is parking like?", "Is it sound-friendly?", "How much does it cost?")
   - Asking personal/profile questions (e.g., "What is my name?", "Who are you?", "Do you remember me?")
   - Asking for filmmaking/scouting advice or creative suggestions
   - Small talk, greetings, thanks, or conversation
   IMPORTANT: If the user asks about the address, features, or details of an existing location (e.g. Las Rozas), that is ALWAYS "chat", NEVER "scout"! Do not trigger a new scout run for informational questions.

2. "scout" — The user is explicitly requesting to search for, scout, or discover NEW locations (e.g., "Find 4 more locations in Berlin", "Search for rooftop spots instead", "Look for options under $1000/day", "Find industrial warehouses in Madrid").

STEP 2: GENERATE RESPONSE BASED ON CLASSIFICATION:

If intent is "chat":
- Provide a direct, thorough, and helpful answer in "chat_reply".
- FORMATTING REQUIREMENT:
  1. Always start with a punchy, bold markdown heading summarizing the answer or topic (e.g. "### Las Rozas House • Address & Location Specs", "### Why This Location Is The Top Choice", "### You're ${userName || 'Filmmaker'}!", "### Production Logistics & Access").
  2. Follow with clear, well-spaced paragraphs explaining the details conversationally.
  3. Use bullet points for specific specs, addresses, pros/cons, or logistical points.
  4. If the user asks for the address or location details of a scouted spot (like Las Rozas), provide all available and realistic geographic details (e.g., municipality: Las Rozas de Madrid, region: Community of Madrid, Spain, accessibility via A-6 highway, residential permit guidance) in a structured format.
- Set "scout_refinement" to empty string.
- Set "updated_slots" to empty object {}.

If intent is "scout":
- Set "intent" to "scout".
- In "scout_refinement", write a concise paragraph summarizing what new locations the user wants, ready to guide the search pipeline.
- In "updated_slots", include any newly mentioned criteria (e.g. new region, budget, or scene requirements).
- Set "chat_reply" to empty string.

Return ONLY a valid JSON object matching the requested schema.`;

  try {
    const text = await generateWithRetry(prompt, 2, {
      responseSchema: CHAT_RESPONSE_SCHEMA,
    });
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Chat intent classification failed:", err);

    // Fallback: heuristic check
    const lower = message.toLowerCase();
    const isExplicitScout =
      /\b(search for|find me|scout new|look for new|find another|find other)\b/.test(lower);

    if (isExplicitScout) {
      return NextResponse.json({
        intent: "scout",
        chat_reply: "",
        scout_refinement: message,
        updated_slots: {},
      });
    }

    // Default to chat reply so agent activity is never run unexpectedly
    return NextResponse.json({
      intent: "chat",
      chat_reply: `### ScoutAI Note\n\nI reviewed your question regarding "${message}". Let me know if you would like me to dive deeper into any of the scouted locations or scout new ones.`,
      scout_refinement: "",
      updated_slots: {},
    });
  }
}
