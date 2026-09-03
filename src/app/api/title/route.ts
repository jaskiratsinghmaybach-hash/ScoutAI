import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ConversationTurn } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
    const { history, description } = (await req.json()) as {
        history: ConversationTurn[];
        description: string;
    };

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

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
        const result = await model.generateContent(prompt);
        const title = result.response.text().trim().replace(/["""'']/g, "").slice(0, 50);
        return NextResponse.json({ title });
    } catch (err) {
        console.error("Title generation error:", err);
        // Fallback: clean up the raw description
        const fallback = description.slice(0, 40).replace(/\s+/g, " ").trim();
        return NextResponse.json({ title: fallback });
    }
}