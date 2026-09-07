import { GoogleGenAI, ThinkingLevel, Type, type Schema } from "@google/genai";
import { ExternalAccountClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";
import type { SceneQuery, ScoutingPacket, Location, AgentStep } from "@/types";

// Vertex AI client (replaces the old AI Studio GoogleGenerativeAI
// client).

// LOCAL DEV: auth is handled transparently by Application Default
// Credentials (gcloud auth application-default login) — no key
// needed, no code branch required, ADC just works.
//
// PRODUCTION (Vercel): ADC does NOT work in a deployed serverless
// function — there's no local gcloud session to read. Instead we use
// Workload Identity Federation: Vercel issues a short-lived OIDC
// token (via @vercel/oidc), which GCP's STS exchanges for temporary
// credentials scoped to impersonate a dedicated service account — no
// downloadable key file ever exists. This is intentionally NOT
// GOOGLE_APPLICATION_CREDENTIALS/a key file, which is what the old
// comment here used to say — that approach is what WIF was set up to
// avoid.
//
// Which path runs is decided by whether the GCP_* WIF env vars are
// present: they're only set in Vercel's Production environment, so
// local dev automatically stays on the ADC path with zero config.
//
// location "global" — not a regional endpoint like "us-central1" —
// because gemini-3.8-flash (and 3.7-flash) are served through
// Vertex AI's global endpoint. Only gemini-3.5-flash/-flash-lite
// currently also support the regional "us"/"eu" multi-regions.
function buildGenAIClient() {
  // .trim() on every value here is a deliberate defensive measure:
  // a stray leading/trailing tab or space typed or pasted into
  // Vercel's env var UI is invisible in the dashboard but breaks the
  // WIF audience string built below, causing a confusing "Invalid
  // value for audience" 400 from Google's STS endpoint that gives no
  // hint the actual problem is whitespace. This has already happened
  // once during setup — trimming here makes that whole class of bug
  // impossible going forward, regardless of how the env vars get
  // entered.
  const trim = (v: string | undefined) => v?.trim();
  const GOOGLE_CLOUD_PROJECT = trim(process.env.GOOGLE_CLOUD_PROJECT);
  const GOOGLE_CLOUD_LOCATION = trim(process.env.GOOGLE_CLOUD_LOCATION);
  const GCP_PROJECT_ID = trim(process.env.GCP_PROJECT_ID);
  const GCP_PROJECT_NUMBER = trim(process.env.GCP_PROJECT_NUMBER);
  const GCP_SERVICE_ACCOUNT_EMAIL = trim(process.env.GCP_SERVICE_ACCOUNT_EMAIL);
  const GCP_WORKLOAD_IDENTITY_POOL_ID = trim(
    process.env.GCP_WORKLOAD_IDENTITY_POOL_ID
  );
  const GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = trim(
    process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
  );

  const usingWIF =
    GCP_PROJECT_NUMBER &&
    GCP_SERVICE_ACCOUNT_EMAIL &&
    GCP_WORKLOAD_IDENTITY_POOL_ID &&
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;

  if (!usingWIF) {
    // Local dev path — unchanged behavior from before.
    return new GoogleGenAI({
      vertexai: true,
      project: GOOGLE_CLOUD_PROJECT,
      location: GOOGLE_CLOUD_LOCATION || "global",
    });
  }

  // Production path — Vercel OIDC token exchanged for short-lived GCP
  // credentials via the scoutai-vertex service account.
  //
  // The GCP WIF provider here uses "Allowed audiences" set to
  // https://vercel.com/<team-slug> — which is exactly Vercel's
  // DEFAULT token audience (see Vercel's OIDC docs: "By default, the
  // OIDC token's aud claim is set to https://vercel.com/[TEAM_SLUG]").
  // So getVercelOidcToken() is called with NO arguments here — do not
  // pass an explicit `audience` option. Passing one (even the same
  // https://vercel.com/... value) makes @vercel/oidc call Vercel's
  // separate token-EXCHANGE service, which is for minting a token for
  // a genuinely different third-party audience (Azure, AWS, your own
  // API's URL) and rejects Vercel's own default-format URL as an
  // invalid exchange target ("Failed to exchange token: Invalid
  // audience"). The GCP-side `audience` field below (the provider
  // resource name) is a separate, unrelated value — it tells GCP's
  // STS which provider to route the exchange to, and was always
  // correct.
  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    subject_token_supplier: {
      // IMPORTANT: google-auth-library calls
      // `subjectTokenSupplier.getSubjectToken(supplierContext)` with ONE
      // positional argument — a GCP-internal SupplierContext object shaped
      // like `{ audience: "//iam.googleapis.com/projects/.../providers/vercel", ... }`.
      // Passing `getVercelOidcToken` directly as a bare function reference
      // means IT receives that GCP context object as its own `options`
      // argument. Since `supplierContext.audience` is a truthy string,
      // getVercelOidcToken's internal `if (options?.audience)` check fires
      // and incorrectly treats the GCP provider resource name as a
      // requested Vercel custom-audience exchange target — which is
      // exactly the root cause of every "audience does not match" /
      // "Invalid audience" error seen while debugging this. The fix is to
      // wrap it in a closure that ignores whatever argument
      // google-auth-library passes in and calls getVercelOidcToken() with
      // genuinely zero arguments, every time.
      getSubjectToken: () => getVercelOidcToken(),
    },
  });

  if (!authClient) {
    // fromJSON only returns null if the config object itself is
    // malformed — since we build it from a fixed literal above, this
    // should be unreachable, but fail loudly rather than fall through
    // to an untyped/undefined auth client if it ever happens.
    throw new Error(
      "Failed to construct ExternalAccountClient for WIF — check GCP_* env vars are set correctly in Vercel."
    );
  }

  return new GoogleGenAI({
    vertexai: true,
    project: GCP_PROJECT_ID || GOOGLE_CLOUD_PROJECT,
    location: GOOGLE_CLOUD_LOCATION || "global",
    googleAuthOptions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authClient: authClient as any,
      // ^ @google/genai bundles its own private copy of
      // google-auth-library (node_modules/@google/genai/node_modules/
      // google-auth-library), separate from the top-level one we
      // installed and imported ExternalAccountClient from above.
      // TypeScript treats their types as nominally distinct even
      // though they're structurally identical — a real, working
      // ExternalAccountClient instance at runtime, just from "the
      // wrong" package's perspective at the type level. This is a
      // known class of issue with nested/duplicated npm dependencies,
      // not a logic bug — an `any` cast at this single boundary is
      // the standard way to unblock it without disabling type
      // checking anywhere else in the file.
      projectId: GCP_PROJECT_ID || GOOGLE_CLOUD_PROJECT,
    },
  });
}

// NOTE: this is intentionally NOT constructed eagerly at module load
// (i.e. not `export const genAI = buildGenAIClient()`). Next.js
// evaluates every API route module during `next build` to collect
// page/route metadata, and on Vercel's build machine neither local
// ADC nor the runtime WIF env vars are available yet — those only
// exist once the deployed function actually receives a request. An
// eager top-level call here fails the build with "Authentication is
// not set up" even though the code is correct and works fine at
// runtime. Lazily constructing on first real use, and caching the
// result, sidesteps this without changing behavior at request time.
let _genAI: GoogleGenAI | undefined;
function getGenAI(): GoogleGenAI {
  if (!_genAI) {
    _genAI = buildGenAIClient();
  }
  return _genAI;
}

const MODEL = "gemini-3.8-flash";

// How long a single Gemini call is allowed to run before it's treated
// as a failure worth retrying/giving up on, rather than left to hang
// with no ceiling at all. gemini-3.8-flash has "thinking" on by
// default, which can push response time noticeably higher than older
// flash models — 35s leaves real headroom below that. This is the
// FIRST attempt's timeout only; see generateWithRetry for how the
// retry attempt's timeout is scaled down to stay inside the 60s
// stage budget.
const GEMINI_CALL_TIMEOUT_MS = 35000;

// Shared generation config for every plain-text-returning call in this
// file: explicit low thinking level to cut reasoning overhead for
// these classification/extraction/synthesis tasks (root cause of the
// ~17.5s baseline latency on the old SDK, which had no generationConfig
// at all). Callers that need structured JSON output pass an additional
// responseSchema option to generateWithRetry on top of this.
const BASE_GENERATION_CONFIG = {
  thinkingConfig: {
    thinkingLevel: ThinkingLevel.LOW,
  },
};

type GenerateOptions = {
  timeoutMs?: number;
  responseSchema?: Schema;
};

async function callGemini(
  prompt: string,
  timeoutMs: number,
  responseSchema?: Schema
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await getGenAI().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        ...BASE_GENERATION_CONFIG,
        ...(responseSchema
          ? { responseMimeType: "application/json", responseSchema }
          : {}),
        abortSignal: controller.signal,
      },
    });
    const text = response.text;
    if (typeof text !== "string") {
      throw new Error("Gemini response contained no text");
    }
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

export async function generateWithRetry(
  prompt: string,
  retries = 2,
  options: GenerateOptions = {}
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // First attempt gets the full timeout; a retry after a timeout
      // uses a shorter one, so total worst-case time (35s + 1s backoff
      // + 20s ≈ 56s) stays inside the 60s stage budget instead of
      // risking two full 35s attempts back to back.
      const attemptTimeout =
        attempt === 0 ? options.timeoutMs ?? GEMINI_CALL_TIMEOUT_MS : 20000;
      return await callGemini(prompt, attemptTimeout, options.responseSchema);
    } catch (err) {
      const isLastAttempt = attempt === retries - 1;
      const message = err instanceof Error ? err.message : String(err);
      const isRetryable =
        message.includes("503") ||
        message.includes("overloaded") ||
        message.includes("high demand") ||
        message.includes("aborted") ||
        message.includes("timeout") ||
        message.includes("ETIMEDOUT") ||
        message.includes("ECONNRESET");

      if (!isRetryable || isLastAttempt) throw err;

      // Flat 1s backoff rather than exponential — this pipeline runs
      // inside a 60s-per-stage Vercel budget, so keeping worst-case
      // retry cost low and predictable matters more here than being
      // gentle on the upstream API.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Failed after retries");
}

// How long a single Parallel search is allowed to run before this
// pipeline gives up on it and moves on with whatever it has. Without
// this, one slow/hung upstream call has no ceiling and can quietly eat
// a large chunk of a stage's 60s budget — searches run in parallel via
// Promise.all, but Promise.all only resolves once its SLOWEST entry
// does, so one hung request stalls the whole batch. Failing fast here
// and returning "Search unavailable." for that one query (same
// fallback already used for a non-OK HTTP response) keeps the rest of
// the pipeline moving on schedule instead of stalling on it.
const SEARCH_TIMEOUT_MS = 8000;

// Parallel Search API helper
async function parallelSearch(query: string): Promise<string> {
  const apiKey = process.env.PARALLEL_API_KEY!;
  let response: Response;
  try {
    response = await fetch("https://api.parallel.ai/v1beta/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "parallel-beta": "search-extract-2025-10-10",
      },
      body: JSON.stringify({
        objective: query,
        search_queries: [query],
        // Trimmed from 5 to 3 — fewer results means less data to fetch
        // over the wire and less text for the later Gemini calls
        // (synthesis, verification) to read through per query, without
        // meaningfully hurting result quality: the top 3 hits already
        // carry the great majority of what the synthesis/verification
        // prompts actually use.
        max_results: 3,
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    console.error(
      isTimeout
        ? `Parallel search timed out after ${SEARCH_TIMEOUT_MS}ms:`
        : "Parallel search request failed:",
      query,
      err,
    );
    return "Search unavailable.";
  }

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
// Step 1: Generate targeted search queries to discover specific, real-world named filming locations
export async function generateSearchQueries(query: SceneQuery): Promise<string[]> {
  const prompt = `You are an elite film location scout research agent. Given a scene brief, generate 4 HIGHLY TARGETED web search queries to discover REAL, SPECIFIC NAMED PROPERTIES, ARCHITECTURAL VILLAS, ESTATES, AND FILMING VENUES.

SCENE BRIEF:
Description: ${query.description}
Mood: ${query.mood}
Era/Period: ${query.era}
Budget: ${query.budget}
Region preference: ${query.region || "worldwide"}
Special requirements: ${query.requirements?.join(", ") || "none"}${query.priorContext ? `\nPREVIOUS CONTEXT:\n${query.priorContext}\n` : ""}

CRITICAL SEARCH STRATEGY:
Your goal is to find ACTUAL, SPECIFIC NAMED PLACES (e.g. named villas, architectural houses, estates, or studios) that exist on Google Maps — NOT broad geographic regions or generic permit forms.
Construct 4 distinct queries:
1. Specific named architectural houses or villas in the region (e.g., modern villa architecture project in ${query.region || "the area"} on sites like ArchDaily, Dezeen, or Dwell).
2. Location scouting agencies or production directories offering named villas or private properties for filming in ${query.region || "the area"} (e.g., location scouts, shoot locations, private estate film rentals).
3. Real named historical or contemporary estates, manor houses, or waterfront villas in ${query.region || "the area"}.
4. Real film productions, movies, or commercials shot in ${query.region || "the area"} matching this specific visual aesthetic, citing the exact filming location names.

Return exactly 4 search queries as a JSON array of strings. Only return the JSON array, nothing else. Example: ["query1", "query2", "query3", "query4"]`;

  const text = await generateWithRetry(prompt, 2, {
    responseSchema: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  });

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [
      `modern villa architecture ${query.region || ""} archdaily`,
      `filming locations villa estate ${query.region || ""} shoot directory`,
      `named private villas houses ${query.region || ""} film location`,
      `filmed in ${query.region || ""} modern location`,
    ];
  }
}

// Step 2: Run all searches via Parallel
export async function runSearches(
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
// Response schema mirroring the Location shape (minus id, which is
// backfilled by normalizeLocations) — gives the model native JSON mode
// with a concrete shape instead of relying purely on prompt instructions.
const LOCATION_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      name: { type: Type.STRING },
      city: { type: Type.STRING },
      country: { type: Type.STRING },
      score: { type: Type.NUMBER },
      mood_match: { type: Type.STRING },
      mood_fit_percent: { type: Type.NUMBER },
      era_match: { type: Type.STRING },
      era_fit_percent: { type: Type.NUMBER },
      permit_info: { type: Type.STRING },
      permit_url: { type: Type.STRING },
      avg_daily_cost: { type: Type.STRING },
      past_productions: { type: Type.ARRAY, items: { type: Type.STRING } },
      weather_notes: { type: Type.STRING },
      logistics_notes: { type: Type.STRING },
      search_sources: { type: Type.ARRAY, items: { type: Type.STRING } },
      image_query: { type: Type.STRING },
      scene_description: { type: Type.STRING },
    },
    required: [
      "id",
      "name",
      "city",
      "country",
      "score",
      "mood_match",
      "mood_fit_percent",
      "era_match",
      "era_fit_percent",
      "permit_info",
      "avg_daily_cost",
      "past_productions",
      "weather_notes",
      "logistics_notes",
      "search_sources",
      "image_query",
      "scene_description",
    ],
  },
};

export async function synthesizeLocations(
  query: SceneQuery,
  searchResults: Record<string, string>
): Promise<Location[]> {
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

MANDATORY RULES FOR REAL LOCATION NAMES & AUTHENTICITY:
1. SPECIFIC REAL-WORLD PROPERTY NAMES ONLY:
   - "name": MUST be the actual, proper, recognizable name of a REAL, SPECIFIC building, private villa, estate, architectural project, or venue (e.g., "Villa Överby", "Villa Pauli", "Artipelag", "Villa Solbacken", "House Husarö", "Greystone Mansion", "Ennis House").
   - DO NOT INVENT DESCRIPTIVE PLACEHOLDERS: Absolutely NEVER generate generic descriptions disguised as names (e.g. "Modern Minimalist Villa on Forest Cliffs", "The Charred House", "Architect-Designed Waterfront Retreat", "Nordic Glass Residence") and NEVER append fake catalog codes (e.g. "(Stockholm Area V17)"). A real location scout only presents identifiable, contactable locations to a director.
   - DO NOT USE AN ENTIRE ISLAND, NEIGHBORHOOD, OR DISTRICT AS THE LOCATION NAME: If the search results mention an island or district (e.g. "Stora Essingen", "Lidingö", "Djursholm", "Södermalm"), DO NOT use that island or suburb name as the villa's name! You must specify the actual villa, estate, or architectural project name located there (e.g. "Villa Pauli, Djursholm" or "Villa Astrea").
   - If a modern residential property is known by its architectural project title or architect in search results (e.g. "House Husarö by Tham & Videgård", "Villa Circuitus"), use that exact published project name so production teams can find its real blueprints and permit contacts.

2. FACTUAL ACCURACY & DATA INTEGRITY:
   - Only use URLs, facts, and figures that actually appear in the search data above. Never invent a plausible-looking URL, cost, or permit contact. If specific information wasn't found in the search results, say so honestly in that field (e.g. "No permit information found in search results") rather than fabricating a generic answer.

Return a JSON array of exactly 4 location objects. Each must include:
{
  "id": "unique-slug",
  "name": "Actual Real Property or Project Name",
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
  "image_query": "Specific search query to find a representative photo of this exact named property",
  "scene_description": "2-3 sentences describing the physical environment and setting itself — what it actually looks and feels like on the ground (architecture, lighting, textures, surroundings, ambient sound/activity). This is about the PLACE, not why it fits the brief (that's mood_match/era_match) and not shooting logistics (that's logistics_notes) — describe it the way a scout would describe the location to a director who has never seen it."
}
Before assigning scores, explicitly compare each location against every stated requirement (mood, era, budget fit, region, special requirements) and penalize mismatches or unknowns. Scores should genuinely differ across the 4 locations based on real fit differences — avoid clustering all scores in the 80s-90s range. The same applies to mood_fit_percent and era_fit_percent: rate each honestly and independently per location instead of copying the overall score or defaulting every location to the same number.
Base your response on the actual search data. Only return the JSON array.`;

  const text = await generateWithRetry(prompt, 2, {
    responseSchema: LOCATION_SCHEMA,
  });

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
  const cleanName = location.name.replace(/\(.*?\)/g, "").trim();
  const query = `"${cleanName}" ${location.city} ${location.country} architecture address`;
  return parallelSearch(query);
}

export async function filterToRealLocations(locations: Location[]): Promise<Location[]> {
  if (locations.length === 0) return locations;

  const verificationResults = await Promise.all(
    locations.map((loc) => verifyLocationExists(loc)),
  );

  const context = locations
    .map(
      (loc, i) =>
        `LOCATION ${i}: "${loc.name}", ${loc.city}, ${loc.country}\nVERIFICATION SEARCH RESULTS:\n${verificationResults[i]}`,
    )
    .join("\n\n---\n\n");

  const prompt = `You are a strict film location verification supervisor. Verify whether each film location candidate is an ACTUAL, SPECIFIC, FINDABLE PHYSICAL PROPERTY OR VENUE — and NOT a generic descriptive placeholder or an entire geographical district.

CRITICAL VERIFICATION RULES:
1. REJECT (false) any location whose name is a generic descriptive phrase or AI-generated label (e.g. "Modern Minimalist Villa on Forest Cliffs", "The Charred House", "Architect-Designed Waterfront Retreat", "Nordic Glass Residence") or has fake identifiers (e.g. "(Stockholm Area V17)").
2. REJECT (false) any candidate whose name is merely an entire island, town, neighborhood, or district (e.g. "Stora Essingen", "Stockholm Archipelago", "Södermalm") when the brief requested a specific villa or venue. A film crew cannot shoot "on an island" without knowing the specific property!
3. ACCEPT (true) ONLY IF the verification search results confirm that an actual, specific, real-world named property, estate, villa, architectural project, or venue genuinely exists at this location and can be located by a film production team.

${context}

Return a JSON array of ${locations.length} booleans, in the same order as the locations above (index 0 first) — true if verified real, specific, and findable, false if generic, composite, or district-only. Only return the JSON array, nothing else. Example: [true, false, true, true]`;

  try {
    const text = await generateWithRetry(prompt, 2, {
      responseSchema: { type: Type.ARRAY, items: { type: Type.BOOLEAN } },
    });
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
export async function generateReasoning(
  query: SceneQuery,
  locations: Location[]
): Promise<string> {
  if (locations.length === 0) {
    return "No locations could be confirmed as real, findable places for this search.";
  }

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

  return await generateWithRetry(prompt);
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

  // Step 4 — validate site details and accessibility before
  // it's ever shown.
  onStep({
    step: 4,
    action: "Validating site details & accessibility",
    detail: `Cross-referencing site details & accessibility for ${candidateLocations.length} locations...`,
    status: "running",
  });
  const locations = await filterToRealLocations(candidateLocations);
  const droppedCount = candidateLocations.length - locations.length;
  onStep({
    step: 4,
    action: "Validating site details & accessibility",
    detail:
      droppedCount > 0
        ? `Verified ${locations.length}/${candidateLocations.length} locations — filtered ${droppedCount} with incomplete site data`
        : `All ${locations.length} locations verified with confirmed site data`,
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