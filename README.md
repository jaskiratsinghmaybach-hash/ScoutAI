# ScoutAI

**AI location scouting for filmmakers.** Describe a scene — mood, era, budget,
region — and an AI agent researches real filming locations: permit info,
past productions, cost signals, and weather notes.

Built for the Google Cloud Agentic Cinema Hackathon (Parallel track).

## How it works

1. **Parse** — Gemini reads the scene brief and flags vague/unusable input.
2. **Research** — Gemini generates targeted search queries, run live via
   **Parallel Search API**.
3. **Scout** — Gemini Pro synthesizes raw search results into ranked,
   structured location packets.
4. **Report** — Gemini writes a scout's reasoning note summarizing the pick.

Every step streams to the UI in real time via Server-Sent Events, so you can
watch the agent work and see exactly where it is at any point.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Google Gemini (`@google/generative-ai`) — the only AI model used
- Parallel Search API — real-time web research
- Deployed on Vercel

## Setup

```bash
npm install
cp .env.example .env.local
# fill in GEMINI_API_KEY and PARALLEL_API_KEY
npm run dev
```

Visit `http://localhost:3000`.

## Environment variables

| Variable | Where to get it |
|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `PARALLEL_API_KEY` | https://parallel.ai |

## License

MIT — see `LICENSE`.
