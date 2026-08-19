import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SceneQuery, ScoutingPacket, Location, AgentStep } from "@/types";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Parallel Search API helper
async function parallelSearch(query: string): Promise<string> {
  const apiKey = process.env.PARALLEL_API_KEY!;
  const response = await fetch("https://api.parallel.ai/v1/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, num_results: 5 }),
  });

  if (!response.ok) {
    console.error("Parallel search failed:", response.statusText);
    return "Search unavailable.";
  }

  const data = await response.json();
  // Parallel returns results array — flatten to text for Gemini context
  const results = data.results ?? data.organic_results ?? [];
  return results
    .map(
      (r: { title: string; snippet: string; url: string }) =>
        `[${r.title}]: ${r.snippet} (${r.url})`
    )
    .join("\n");
}

// Step 1: Generate search queries from scene description using Gemini
async function generateSearchQueries(query: SceneQuery): Promise<string[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `You are a film location research agent. Given a scene description, generate 4 targeted web search queries to find real filming locations.

Scene: ${query.description}
Mood: ${query.mood}
Era/Period: ${query.era}
Budget: ${query.budget}
Region preference: ${query.region || "worldwide"}
Special requirements: ${query.requirements.join(", ") || "none"}

Return exactly 4 search queries as a JSON array. Focus on: real locations, permit offices, past film productions, and cost data.
Only return the JSON array, nothing else. Example: ["query1", "query2", "query3", "query4"]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [
      `filming locations ${query.region} ${query.mood}`,
      `film permit ${query.region} indie production`,
      `${query.era} architecture locations filming`,
      `movie locations ${query.description.slice(0, 50)}`,
    ];
  }
}

// Step 2: Run all searches via Parallel
async function runSearches(
  queries: string[]
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  await Promise.all(
    queries.map(async (q) => {
      results[q] = await parallelSearch(q);
    })
  );
  return results;
}

// Step 3: Gemini synthesizes research into structured location packets
async function synthesizeLocations(
  query: SceneQuery,
  searchResults: Record<string, string>
): Promise<Location[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const searchContext = Object.entries(searchResults)
    .map(([q, r]) => `Query: ${q}\nResults:\n${r}`)
    .join("\n\n---\n\n");

  const prompt = `You are an expert film location scout with 20 years of experience. Using the real web search results below, identify and rank the top 4 filming locations for this scene.

SCENE REQUIREMENTS:
Description: ${query.description}
Mood: ${query.mood}
Era/Period: ${query.era}
Budget: ${query.budget}
Region: ${query.region || "worldwide"}
Requirements: ${query.requirements.join(", ") || "none"}

REAL SEARCH DATA:
${searchContext}

Return a JSON array of exactly 4 location objects. Each must include:
{
  "id": "unique-slug",
  "name": "Location Name",
  "city": "City",
  "country": "Country",
  "score": 0-100,
  "mood_match": "Explanation of mood fit",
  "era_match": "Explanation of era/period fit",
  "permit_info": "Real permit process details",
  "permit_url": "URL to permit office if found",
  "avg_daily_cost": "Estimated daily location fee",
  "past_productions": ["Film 1", "Film 2"],
  "weather_notes": "Best season, weather considerations",
  "logistics_notes": "Crew access, nearby facilities",
  "search_sources": ["source url 1", "source url 2"],
  "image_query": "Specific search query to find a representative photo"
}

Base your response on the actual search data. Only return the JSON array.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

// Step 4: Generate agent reasoning summary
async function generateReasoning(
  query: SceneQuery,
  locations: Location[]
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `As a film location scout, write a brief 2-3 sentence professional reasoning note explaining why these locations were selected for the scene and what makes the top pick stand out.

Scene: ${query.description}
Top location: ${locations[0]?.name}, ${locations[0]?.city}
Score: ${locations[0]?.score}/100

Keep it concise, professional, and specific to the scene.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

// Main agent orchestrator
export async function runScoutAgent(
  query: SceneQuery,
  onStep: (step: AgentStep) => void
): Promise<ScoutingPacket> {
  // Step 1
  onStep({
    step: 1,
    action: "Analyzing scene requirements",
    detail: "Gemini is parsing your scene for location criteria...",
    status: "running",
  });
  const searchQueries = await generateSearchQueries(query);
  onStep({
    step: 1,
    action: "Analyzing scene requirements",
    detail: `Generated ${searchQueries.length} targeted search queries`,
    status: "done",
  });

  // Step 2
  onStep({
    step: 2,
    action: "Searching for real locations",
    detail: `Running ${searchQueries.length} searches via Parallel...`,
    status: "running",
  });
  const searchResults = await runSearches(searchQueries);
  onStep({
    step: 2,
    action: "Searching for real locations",
    detail: "Retrieved permit data, productions history, and cost signals",
    status: "done",
  });

  // Step 3
  onStep({
    step: 3,
    action: "Scouting and ranking locations",
    detail: "Gemini Pro is synthesizing research into scouting packets...",
    status: "running",
  });
  const locations = await synthesizeLocations(query, searchResults);
  onStep({
    step: 3,
    action: "Scouting and ranking locations",
    detail: `Found ${locations.length} candidate locations`,
    status: "done",
  });

  // Step 4
  onStep({
    step: 4,
    action: "Writing scout's report",
    detail: "Generating professional reasoning summary...",
    status: "running",
  });
  const reasoning = await generateReasoning(query, locations);
  onStep({
    step: 4,
    action: "Writing scout's report",
    detail: "Scouting packet complete",
    status: "done",
  });

  return {
    query,
    locations,
    agent_reasoning: reasoning,
    generated_at: new Date().toISOString(),
  };
}
