import { NextRequest, NextResponse } from "next/server";
import { generateWithRetry } from "@/lib/agent";
import type { ConversationTurn } from "@/types";

export async function POST(req: NextRequest) {
    const { history, description } = (await req.json()) as {
        history: ConversationTurn[];
        description: string;
    };
    void history; // kept in the request shape for future use; unused today, same as before migration

    const prompt = `Generate a short, descriptive title for this film location scouting session.

Scene description: ${description}

Rules:
- Maximum 5 words
- No punctuation, no quotes
- Title case (capitalize each word)
- Describe the scene/setting, not the action of searching
- Examples: "Gothic Cathedral Night Scene", "1960s Tokyo Street Chase", "Tropical Jungle Survival Camp"

Return only the title, nothing else.`;

    try {
        const text = await generateWithRetry(prompt);
        const title = text.replace(/["""'']/g, "").slice(0, 50);
        return NextResponse.json({ title });
    } catch (err) {
        console.error("Title generation error:", err);
        // Fallback: clean up the raw description
        const fallback = description.slice(0, 40).replace(/\s+/g, " ").trim();
        return NextResponse.json({ title: fallback });
    }
}