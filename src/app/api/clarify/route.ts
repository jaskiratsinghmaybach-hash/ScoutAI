import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SlotState, ClarifyResponse, ConversationTurn } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SLOT_LABELS: Record<keyof SlotState, string> = {
  description: "what the scene is",
  mood: "the emotional tone/mood",
  era: "the time period/era",
  budget: "the budget tier",
  region: "the region/country preference",
  duration: "the shoot duration or dates",
  requirements: "any special location requirements",
};

export async function POST(req: NextRequest) {
  const { history, slots } = (await req.json()) as {
    history: ConversationTurn[];
    slots: SlotState;
  };

  const missingSlots = (Object.keys(SLOT_LABELS) as (keyof SlotState)[]).filter(
    (key) => !slots[key] || slots[key].trim().length === 0
  );

  if (missingSlots.length === 0) {
    return NextResponse.json({ next_question: null, updated_slots: {} } satisfies ClarifyResponse);
  }

  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

  const conversationText = history
    .map((turn) => `${turn.role === "user" ? "User" : "ScoutAI"}: ${turn.content}`)
    .join("\n");

  const prompt = `You are ScoutAI, a film location scouting assistant having a natural conversation with a filmmaker to understand their scene before researching real locations.

CONVERSATION SO FAR:
${conversationText}

INFORMATION YOU STILL NEED (in priority order, but use judgment):
${missingSlots.map((s) => `- ${s}: ${SLOT_LABELS[s]}`).join("\n")}

Your task:
1. Re-read the full conversation. If the user already revealed any of the missing information implicitly (e.g. they mentioned "1920s speakeasy" which covers both mood AND era), extract it into updated_slots even if you weren't directly asked.
2. Pick the SINGLE most useful next question to ask, phrased naturally and conversationally — not robotic. Reference what they already told you if relevant.
3. Decide if this question is better as free text (open-ended, like describing mood or requirements) or multiple choice (like budget tier, region, duration ranges). Provide 3-5 short options for choice questions.
4. If ALL the missing information now has a reasonable answer (from conversation history), return next_question as null.

Return ONLY valid JSON in this exact shape, nothing else:
{
  "next_question": {
    "text": "your natural question here",
    "type": "text" or "choice",
    "options": ["opt1", "opt2", "opt3"] (only if type is choice),
    "slot": "one of: description, mood, era, budget, region, duration, requirements"
  } or null,
  "updated_slots": {
    "slot_name": "extracted value"
  }
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed: ClarifyResponse = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Clarify error:", err);
    // Fail safe: ask the first missing slot as plain text
    const fallbackSlot = missingSlots[0];
    return NextResponse.json({
      next_question: {
        text: `Can you tell me about ${SLOT_LABELS[fallbackSlot]}?`,
        type: "text",
        slot: fallbackSlot,
      },
      updated_slots: {},
    } satisfies ClarifyResponse);
  }
}