import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SceneQuery, ScoutingPacket, Location, AgentStep } from "@/types";


export async function generateWithRetry(
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
export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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

// Coerces the agent's mood_fit_percent/era_fit_percent output into a
// clean 0-100 number. Accepts a JSON number or a plain numeric string
// (e.g. "85") since models occasionally quote numbers despite the
// schema — but returns null (never a guessed number) for anything else,
// including prose, so the UI can render an honest empty state rather
// than a fabricated percentage.
function normalizeFitPercent(value: unknown): number | null {
  let num: number;
  if (typeof value === "number") {
    num = value;
  } else if (typeof value === "string" && /^\s*\d+(\.\d+)?\s*$/.test(value)) {
    num = parseFloat(value);
  } else {
    return null;
  }
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function normalizeLocations(raw: unknown): Location[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, i) => {
    const loc = item as Partial<Location> & {
      mood_fit_percent?: unknown;
      era_fit_percent?: unknown;
    };
    return {
      id: loc.id ?? `location-${i}`,
      name: loc.name ?? "Unknown location",
      city: loc.city ?? "",
      country: loc.country ?? "",
      score: typeof loc.score === "number" ? loc.score : 0,
      mood_match: loc.mood_match ?? "",
      era_match: loc.era_match ?? "",
      mood_fit_percent: normalizeFitPercent(loc.mood_fit_percent),
      era_fit_percent: normalizeFitPercent(loc.era_fit_percent),
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
      scene_description: loc.scene_description ?? "",
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
  "mood_fit_percent": "An integer 0-100 rating of how well this location's mood/atmosphere matches the requested mood. Judge honestly and independently per location — these should genuinely differ across the 4 locations, not cluster together. This is a separate, standalone judgment from mood_match's prose explanation and from the overall score field.",
  "era_match": "Explanation of era/period fit",
  "era_fit_percent": "An integer 0-100 rating of how well this location's architecture/period fits the requested era. Judge honestly and independently per location — if the era wasn't specified or doesn't clearly apply, use your honest best judgment rather than defaulting to 100. This is a separate, standalone judgment from era_match's prose explanation and from the overall score field.",
  "permit_info": "Real permit process details",
  "permit_url": "ONLY include this field if you found an actual URL in the search results above for this specific location's permit process. Copy the exact URL from the search data. If no real permit URL was found in the search results, OMIT this field entirely (do not invent or guess a URL).",
  "avg_daily_cost": "Estimated daily location fee",
  "past_productions": ["Film 1", "Film 2"],
  "weather_notes": "Best season, weather considerations",
  "logistics_notes": "Crew access, nearby facilities",
  "search_sources": ["source url 1", "source url 2"],
  "image_query": "Specific search query to find a representative photo",
  "scene_description": "2-3 sentences describing the physical environment and setting itself — what it actually looks and feels like on the ground (architecture, lighting, textures, surroundings, ambient sound/activity). This is about the PLACE, not why it fits the brief (that's mood_match/era_match) and not shooting logistics (that's logistics_notes) — describe it the way a scout would describe the location to a director who has never seen it."
}
Before assigning scores, explicitly compare each location against every stated requirement (mood, era, budget fit, region, special requirements) and penalize mismatches or unknowns. Scores should genuinely differ across the 4 locations based on real fit differences — avoid clustering all scores in the 80s-90s range. The same applies to mood_fit_percent and era_fit_percent: rate each honestly and independently per location instead of copying the overall score or defaulting every location to the same number.
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

// Step 4: Verify each candidate location is a real, findable place —
// not merely that its cited FACTS (permits, cost) trace to search
// results, but that its IDENTITY itself does. synthesizeLocations'
// prompt only guards the former; a generic-sounding but well-supported
// description ("Suburban Home with Bright Kitchen") can still slip
// through as a synthesized composite rather than one real property.
// This step runs one targeted Parallel search per candidate — its
// name/city/country specifically, not the broad scene-description
// queries from Step 2 — then has Gemini judge, in one batched call
// across all candidates, whether each one is actually confirmed by
// real results (a specific address, business listing, review site,
// news mention) versus unconfirmed/generic. Runs in parallel per
// location (Promise.all), so latency is roughly one search's worth,
// not one per location sequentially.
async function verifyLocationExists(location: Location): Promise<string> {
  const query = `"${location.name}" ${location.city} ${location.country} address location`;
  return parallelSearch(query);
}

async function filterToRealLocations(locations: Location[]): Promise<Location[]> {
  if (locations.length === 0) return locations;

  const verificationResults = await Promise.all(
    locations.map((loc) => verifyLocationExists(loc)),
  );

  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

  const context = locations
    .map(
      (loc, i) =>
        `LOCATION ${i}: "${loc.name}", ${loc.city}, ${loc.country}\nVERIFICATION SEARCH RESULTS:\n${verificationResults[i]}`,
    )
    .join("\n\n---\n\n");

  const prompt = `You are verifying whether film location candidates are REAL, findable places — not judging whether they're good filming locations, only whether they genuinely exist.

For each location below, its own targeted verification search results are provided. Decide if those results actually confirm this is a real, specific, findable place (e.g. a named business, an address, a review/listing site entry, a news mention of this specific place) — versus generic/irrelevant results, or results about a different, unrelated place, which means this location could not be confirmed as real.

Be strict: a location described only in vague, composite terms ("Suburban Home with Bright Kitchen") with no verification results actually naming or confirming that specific property is NOT verified, even if the results contain other real-sounding content nearby.

${context}

Return a JSON array of ${locations.length} booleans, in the same order as the locations above (index 0 first) — true if verified real, false if not confirmed. Only return the JSON array, nothing else. Example: [true, false, true, true]`;

  try {
    const text = await generateWithRetry(model, prompt);
    const cleaned = text.replace(/```json|```/g, "").trim();
    const verdicts = JSON.parse(cleaned) as unknown;

    if (!Array.isArray(verdicts) || verdicts.length !== locations.length) {
      console.error("Location verification returned unexpected shape:", verdicts);
      return [];
    }

    return locations.filter((_, i) => verdicts[i] === true);
  } catch (err) {
    console.error("Location verification failed:", err);
    return [];
  }
}

// Step 5: Generate agent reasoning summary
async function generateReasoning(
  query: SceneQuery,
  locations: Location[]
): Promise<string> {
  if (locations.length === 0) {
    return "No locations could be confirmed as real, findable places for this search.";
  }

  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

  const prompt = `As a film location scout, summarize your findings for this scene in a tight, scannable format.

Scene: ${query.description}
Top location: ${locations[0]?.name}, ${locations[0]?.city}
Score: ${locations[0]?.score}/100

Return your response in this exact format, nothing else:

[One short punchy sentence naming the top pick and why it wins]

- [One-line highlight about cost/budget fit]
- [One-line highlight about permits/logistics]
- [One-line highlight about mood/era fit]

Keep every line under 15 words. No fluff, no "I hope this helps," just the facts a busy filmmaker needs at a glance.`;

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
    detail: "Gemini is synthesizing research into scouting packets...",
    status: "running",
  });
  const candidateLocations = await synthesizeLocations(query, searchResults);
  onStep({
    step: 3,
    action: "Scouting and ranking locations",
    detail: `Found ${candidateLocations.length} candidate locations`,
    status: "done",
  });

  // Step 4 — verify each candidate is a real, findable place before
  // it's ever shown.
  onStep({
    step: 4,
    action: "Verifying locations are real",
    detail: `Confirming ${candidateLocations.length} locations actually exist...`,
    status: "running",
  });
  const locations = await filterToRealLocations(candidateLocations);
  const droppedCount = candidateLocations.length - locations.length;
  onStep({
    step: 4,
    action: "Verifying locations are real",
    detail:
      droppedCount > 0
        ? `Confirmed ${locations.length}/${candidateLocations.length} — dropped ${droppedCount} unverified`
        : `All ${locations.length} locations confirmed real`,
    status: "done",
  });

  // Step 5
  onStep({
    step: 5,
    action: "Writing scout's report",
    detail: "Generating professional reasoning summary...",
    status: "running",
  });
  const reasoning = await generateReasoning(query, locations);
  onStep({
    step: 5,
    action: "Writing scout's report",
    detail: "Scouting packet complete",
    status: "done",
  });

  return {
    query,
    locations,
    agent_reasoning: reasoning,
    generated_at: new Date().toISOString(),
    narrowing_note:
      locations.length < candidateLocations.length
        ? locations.length === 0
          ? "These search requirements are too niche to confirm any real filming locations — try broadening the scene, mood, or region."
          : "These search requirements are too niche to confirm more real filming locations — showing only the ones that could be verified."
        : undefined,
  };
}