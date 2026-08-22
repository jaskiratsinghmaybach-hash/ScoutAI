import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SceneQuery, ScoutingPacket, Location, AgentStep } from "@/types";


async function generateWithRetry(
  model: ReturnType<typeof genAI.getGenerativeModel>,
  prompt: string,
  retries = 3
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err) {
      const isLastAttempt = attempt === retries - 1;
      const message = err instanceof Error ? err.message : String(err);
      const isRetryable = message.includes("503") || message.includes("overloaded") || message.includes("high demand");

      if (!isRetryable || isLastAttempt) throw err;

      const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Failed after retries");
}


// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Parallel Search API helper
async function parallelSearch(query: string): Promise<string> {
  const apiKey = process.env.PARALLEL_API_KEY!;
  const response = await fetch("https://api.parallel.ai/v1beta/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "parallel-beta": "search-extract-2025-10-10",
    },
    body: JSON.stringify({
      objective: query,
      search_queries: [query],
      max_results: 5,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Parallel search failed:", response.status, errorBody);
    return "Search unavailable.";
  }

  const data = await response.json();
  const results = data.results ?? [];
  return results
    .map(
      (r: { title?: string; url?: string; excerpts?: string[] }) =>
        `[${r.title ?? "Untitled"}]: ${(r.excerpts ?? []).join(" ")} (${r.url ?? ""})`
    )
    .join("\n");
}
// Step 1: Generate search queries from scene description using Gemini
async function generateSearchQueries(query: SceneQuery): Promise<string[]> {
const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

  const prompt = `You are a film location research agent. Given a scene description, generate 4 targeted web search queries to find real filming locations.

Scene: ${query.description}
Mood: ${query.mood}
Era/Period: ${query.era}
Budget: ${query.budget}
Region preference: ${query.region || "worldwide"}
Special requirements: ${query.requirements?.join(", ") || "none"}${query.priorContext ? `\nPREVIOUS CONTEXT (this is a refinement of an earlier search):\n${query.priorContext}\n` : ""}

Return exactly 4 search queries as a JSON array. Focus on: real locations, permit offices, past film productions, and cost data.
Only return the JSON array, nothing else. Example: ["query1", "query2", "query3", "query4"]`;

  const text = await generateWithRetry(model, prompt);

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

function normalizeLocations(raw: unknown): Location[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, i) => {
    const loc = item as Partial<Location>;
    return {
      id: loc.id ?? `location-${i}`,
      name: loc.name ?? "Unknown location",
      city: loc.city ?? "",
      country: loc.country ?? "",
      score: typeof loc.score === "number" ? loc.score : 0,
      mood_match: loc.mood_match ?? "",
      era_match: loc.era_match ?? "",
      permit_info: loc.permit_info ?? "",
      permit_url: loc.permit_url,
      avg_daily_cost: loc.avg_daily_cost ?? "",
      past_productions: Array.isArray(loc.past_productions)
        ? loc.past_productions
        : [],
      weather_notes: loc.weather_notes ?? "",
      logistics_notes: loc.logistics_notes ?? "",
      search_sources: Array.isArray(loc.search_sources)
        ? loc.search_sources
        : [],
      image_query: loc.image_query ?? `${loc.name ?? ""} ${loc.city ?? ""}`,
    };
  });
}

// Step 3: Gemini synthesizes research into structured location packets
async function synthesizeLocations(
  query: SceneQuery,
  searchResults: Record<string, string>
): Promise<Location[]> {
const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

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
Requirements: ${query.requirements.join(", ") || "none"} ${query.priorContext ? `\nPREVIOUS CONTEXT (this is a refinement — take it into account, e.g. if user asked for cheaper options, prioritize lower-cost locations):\n${query.priorContext}\n` : ""}

REAL SEARCH DATA:
${searchContext}
CRITICAL: Only use URLs, facts, and figures that actually appear in the search data above. Never invent a plausible-looking URL, cost, or permit contact. If specific information wasn't found in the search results, say so honestly in that field (e.g. "No permit information found in search results") rather than fabricating a generic answer.
Return a JSON array of exactly 4 location objects. Each must include:
{
  "id": "unique-slug",
  "name": "Location Name",
  "city": "City",
  "country": "Country",
  "score": "An integer 0-100. Use the FULL range honestly — a location that's merely acceptable should score 40-60, a strong match 65-80, and only an exceptional, near-perfect match for ALL stated requirements (mood, era, budget, region, special requirements) should score above 85. Do not default to high scores out of politeness. If a location is missing key information from search results, that uncertainty should also lower its score.",
  "mood_match": "Explanation of mood fit",
  "era_match": "Explanation of era/period fit",
  "permit_info": "Real permit process details",
  "permit_url": "ONLY include this field if you found an actual URL in the search results above for this specific location's permit process. Copy the exact URL from the search data. If no real permit URL was found in the search results, OMIT this field entirely (do not invent or guess a URL).",
  "avg_daily_cost": "Estimated daily location fee",
  "past_productions": ["Film 1", "Film 2"],
  "weather_notes": "Best season, weather considerations",
  "logistics_notes": "Crew access, nearby facilities",
  "search_sources": ["source url 1", "source url 2"],
  "image_query": "Specific search query to find a representative photo"
}
Before assigning scores, explicitly compare each location against every stated requirement (mood, era, budget fit, region, special requirements) and penalize mismatches or unknowns. Scores should genuinely differ across the 4 locations based on real fit differences — avoid clustering all scores in the 80s-90s range.
Base your response on the actual search data. Only return the JSON array.`;

  const text = await generateWithRetry(model, prompt);

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return normalizeLocations(parsed);
} catch {
    return [];
}
}

// Step 4: Generate agent reasoning summary
async function generateReasoning(
  query: SceneQuery,
  locations: Location[]
): Promise<string> {
const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

  const prompt = `As a film location scout, write a brief 2-3 sentence professional reasoning note explaining why these locations were selected for the scene and what makes the top pick stand out.

Scene: ${query.description}
Top location: ${locations[0]?.name}, ${locations[0]?.city}
Score: ${locations[0]?.score}/100

Keep it concise, professional, and specific to the scene.`;

  return await generateWithRetry(model, prompt);
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
