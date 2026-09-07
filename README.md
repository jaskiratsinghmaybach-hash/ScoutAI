# ScoutAI

**AI location scouting for filmmakers.** Describe a scene — mood, era,
budget, region — and an agentic pipeline researches real filming
locations: permit and access notes researched from available sources,
past-production signals, cost signals, and site verification, all
backed by live web research instead of the model's own guesses.

Built for the **Google Cloud Agentic Cinema Hackathon** (Parallel track).

## How it works

The pipeline runs as five staged steps, each a separate serverless
invocation so no single request has to hold the whole pipeline's
wall-clock time inside one function's duration limit:

1. **Analyze** — Gemini parses the scene brief into structured search
   criteria and generates targeted queries.
2. **Research** — Those queries run live against the **Parallel
   Search API** for real, current web results.
3. **Scout** — Gemini synthesizes the raw search results into ranked,
   structured location candidates.
4. **Verify** — Each candidate is re-checked against fresh search
   evidence and filtered: generic descriptions, AI-invented names, and
   district-level (non-specific) results are rejected before anything
   reaches the UI.
5. **Report** — Gemini writes a short scout's-reasoning summary for
   the final packet.

Progress is persisted to Supabase after every stage and the client
polls/subscribes to that run row, so a run survives across multiple
short-lived function invocations instead of depending on one
long-lived connection. Every surfaced location links back to its
`search_sources` so a filmmaker can see the actual evidence behind
each pick (Sources tab).

The app also supports a conversational follow-up chat scoped to a run
or to a specific location card, and a shareable read-only view of a
completed scouting packet.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **Google Gemini 3.8 Flash via Vertex AI** (`@google/genai`, `vertexai: true`) —
  the only AI model provider used. Local dev authenticates via
  Application Default Credentials; production (Vercel) authenticates
  via Workload Identity Federation — Vercel's own OIDC token exchanged
  for short-lived GCP credentials, with no downloadable service-account
  key ever stored. See `src/lib/agent.ts` for the full auth path.
- **Parallel Search API** — real-time web research behind every
  location candidate and its verification pass.
- **Supabase** — durable run state across staged pipeline invocations.
- Deployed on **Vercel**.

## Setup

```bash
npm install
cp .env.example .env.local
# fill in the values described below
npm run dev
```

Visit `http://localhost:3000`.

For local dev, Gemini auth uses Application Default Credentials rather
than an API key:

```bash
gcloud auth application-default login
```

## Environment variables

See `.env.example` for the full list with inline notes. In short:

| Variable | Purpose |
|---|---|
| `PARALLEL_API_KEY` | Parallel Search API — https://parallel.ai |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Durable scout-run state |
| `INTERNAL_STAGE_SECRET` | Shared secret protecting the internal `/api/scout/stage-*` routes from direct external calls |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` | Local-dev Vertex AI project/location (used with ADC) |
| `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | Production-only Workload Identity Federation for Vertex AI on Vercel — leave unset locally |

`VERCEL_URL` is injected automatically by Vercel at runtime and does
not need to be set manually.

## License

MIT — see `LICENSE`.