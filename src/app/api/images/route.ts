import { NextRequest } from "next/server";
import { fetchLocationImages } from "@/lib/wikimedia";

export const runtime = "nodejs";

/**
 * Standalone image lookup, deliberately separate from /api/scout.
 * Images are no longer fetched as part of the scout pipeline (see
 * agent.ts — Step 5 was removed) so that a location's imagery can
 * never block or slow down the rest of the scout result. The client
 * (ImageryTab) calls this once per location, independently, as soon
 * as that location's tab is actually shown — not eagerly for all 4 at
 * once — and each call is fully isolated: one slow/failed lookup has
 * no effect on any other location's request.
 */
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query");

  if (!query || !query.trim()) {
    return Response.json({ images: [] }, { status: 400 });
  }

  try {
    const images = await fetchLocationImages(query);
    return Response.json(
      { images },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (err) {
    // fetchLocationImages already catches its own errors and resolves
    // to [] — this catch is just an extra safety net so a genuinely
    // unexpected throw still returns a clean empty result instead of a
    // 500 the client would have to special-case.
    console.error("Image lookup route error:", err);
    return Response.json({ images: [] }, { status: 200 });
  }
}