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

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const conversationText = history
    .map((turn) => `${turn.role === "user" ? "User" : "ScoutAI"}: ${turn.content}`)
    .join("\n");

  const lastUserMessage = [...history].reverse().find((t) => t.role === "user")?.content ?? "";

  // Count how many times ScoutAI has already asked about each still-missing
  // slot, so we can detect a stall (same slot asked repeatedly with no real
  // answer) deterministically instead of relying on the model to notice.
  const slotAskCounts: Record<string, number> = {};
  for (const key of missingSlots) {
    const label = SLOT_LABELS[key];
    slotAskCounts[key] = history.filter(
      (t) => t.role === "assistant" && t.content.toLowerCase().includes(label.toLowerCase())
    ).length;
  }
  const stalledSlot = missingSlots.find((key) => slotAskCounts[key] >= 2);

  const prompt = `You are ScoutAI, a film location scouting assistant with a warm, confident, slightly enthusiastic personality — like a well-traveled location scout who genuinely loves this work. You are having a natural conversation with a filmmaker to understand their scene before researching real locations.

${stalledSlot ? `STALL DETECTED: you have already asked about "${SLOT_LABELS[stalledSlot]}" at least twice without getting a real, usable answer for it. Do NOT try a vague-choice or creative-suggestion approach for this slot again — it hasn't worked. Instead, ask ONE direct, plain "text" type question for exactly this slot, phrased simply and explicitly (e.g. "Which country or region should I focus the search on?"). Do not offer multiple-choice options this time. If the user still doesn't give a usable answer after this, you are allowed to accept a general/open answer like "anywhere" or "flexible" as sufficient and move on.` : ""}

CONVERSATION SO FAR:
${conversationText}

MOST RECENT USER MESSAGE:
"${lastUserMessage}"

INFORMATION YOU STILL NEED (in priority order, but use judgment):
${missingSlots.map((s) => `- ${s}: ${SLOT_LABELS[s]}${slotAskCounts[s] > 0 ? ` (already asked ${slotAskCounts[s]}x)` : ""}`).join("\n")}

STEP 1 — Classify the most recent user message into exactly one type:
- "greeting": a hello/hi/hey/sup with no scene content ("hey scout", "hi there", "yo")
- "small_talk": casual chat, thanks, jokes, or asides not describing a scene ("how are you", "lol nice", "you're fast")
- "vague": they want help but gave nothing concrete to work with ("surprise me", "something cool", "not sure yet")
- "off_topic": unrelated to location scouting entirely
- "scene_brief" or "clarifying_answer": they described a scene, answered a prior question, or gave usable project detail — proceed normally

IMPORTANT — before extracting slots, check what was actually said against what was actually asked:
- Look at the last ScoutAI message in the conversation (the question you just asked) and the user's reply to it.
- Never assume the reply answers that specific question just because it came right after it. A reply can answer a completely different slot than the one asked, answer several slots at once, or answer none of them (e.g. it's a scene idea offered as an example, not a direct answer).
- Read the actual content of the reply and figure out, from its meaning, which slot(s) it genuinely fills. If the user picked a suggested option like "A rain-soaked rooftop confrontation, 1980s noir" — that is a scene description (and possibly implies mood/era too), not necessarily an answer to whatever slot the question happened to be tagged with. Extract accordingly, into whichever slots the content actually supports, not into a slot just because it was "next in line."
- If the reply doesn't clearly answer anything and adds no new information, treat it as vague rather than forcing it into a slot.

STEP 2 — Respond based on the classification:

If greeting, small_talk, or off_topic:
- Do NOT ask a slot-filling question.
- Reply warmly and briefly in ScoutAI's voice, acknowledge them, and invite them to describe the scene or project. Keep it to 1-2 sentences.
- Set "next_question" to null and put your reply in "chat_reply".

If vague:
- Never repeat a generic slot question like "tell me about the mood/era/etc." verbatim — that defeats the point of this branch.
- You MUST return "next_question" as a "choice" type question.
- Set "slot" to whichever of the still-missing slots your options are actually answering (e.g. if description is already known and mood is missing, your options should be mood-flavored and slot should be "mood").
- The question "text" should be a short, inviting line like "Not sure yet? Here are a few directions to spark it:"
- "options" MUST contain 3 concrete, plain-spoken choices tailored to whichever slot you picked — write them the way a working filmmaker would actually describe a scene out loud, NOT like a poetic caption or short-story pitch. Avoid stacking multiple vivid adjectives before every noun (e.g. avoid "sun-drenched," "rain-soaked," "neon-lit" style writing). Say what the scene or mood plainly IS, not how it feels in literary prose.
  - Good, for description: "A confrontation scene on a rooftop at night, 1980s crime film" / "An outdoor wedding at a vineyard, daytime"
  - Bad, for description: "A rain-soaked rooftop confrontation, 1980s noir..." / "A sun-drenched vineyard wedding in the countryside..."
  - Good, for mood: "Tense and on edge", "Warm and nostalgic", "Fast-paced and chaotic"
  - Invent fresh ones each time in this plain style, don't reuse examples verbatim.
- Leave "chat_reply" empty in this case — the options themselves carry the invitation.

If scene_brief or clarifying_answer:
- Re-read the full conversation. Extract every slot the content actually supports — not just the one slot the most recent question was about. If the user's reply is a rich scene idea (e.g. picked from suggestions), it likely fills description AND implies mood/era — fill all of them.
- Pick the SINGLE most useful next question to ask, phrased naturally and conversationally — not robotic. Reference what they already told you if relevant. Only ask about slots that are still genuinely missing after your extraction above.
- Decide if this question is better as free text (open-ended, like describing mood or requirements) or multiple choice (like budget tier, region, duration ranges). Provide 3-5 short options for choice questions.
- Never ask the exact same question text you already asked earlier in this conversation — if the user's reply didn't answer it (e.g. they said "surprise me" instead), treat that as vague and follow the vague branch instead of repeating yourself.
- If ALL the missing information now has a reasonable answer (from conversation history), return next_question as null and leave chat_reply empty.

Return ONLY valid JSON in this exact shape, nothing else:
{
  "message_type": "greeting" | "small_talk" | "vague" | "off_topic" | "scene_brief" | "clarifying_answer",
  "chat_reply": "in-character reply text, or empty string if not applicable",
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
    // Fail safe: light heuristic instead of blindly asking a slot question,
    // so a bare greeting doesn't get interrogated even when the model call fails.
    const trimmed = lastUserMessage.trim().toLowerCase();
    const isLikelyGreeting =
      trimmed.length > 0 &&
      trimmed.length <= 20 &&
      /^(hey|hi|hello|yo|sup|hiya|howdy)\b/.test(trimmed);

    if (isLikelyGreeting) {
      return NextResponse.json({
        message_type: "greeting",
        chat_reply: "Hey! Good to see you — what scene or project are you scouting for?",
        next_question: null,
        updated_slots: {},
      } satisfies ClarifyResponse);
    }

    const fallbackSlot = missingSlots[0];
    return NextResponse.json({
      message_type: "scene_brief",
      chat_reply: "",
      next_question: {
        text: `Can you tell me about ${SLOT_LABELS[fallbackSlot]}?`,
        type: "text",
        slot: fallbackSlot,
      },
      updated_slots: {},
    } satisfies ClarifyResponse);
  }
}