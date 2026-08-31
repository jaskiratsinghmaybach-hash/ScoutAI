import type { LocationImage } from "@/types";

/**
 * Fetches representative photos for a location from Wikimedia Commons
 * (the Action API — no key/billing required, unlike the newer REST
 * api.wikimedia.org). Mirrors the existing parallelSearch() pattern in
 * agent.ts: a single small fetch helper, non-throwing on failure (a
 * failed/empty lookup returns an empty array — the caller shows a
 * "no images found" fallback rather than anything breaking).
 *
 * Fails fast: a strict 3s timeout per request (FETCH_TIMEOUT_MS), so a
 * stalled Wikimedia response can't hang the caller for long — matters
 * both for the one location awaited inside the scout pipeline (see
 * agent.ts's attachTopImage) and for the per-location client calls
 * made via /api/images for every other location.
 *
 * Per-process cache, keyed by the exact query string, so the same
 * location's images aren't re-fetched twice in one session (e.g. the
 * pipeline's own top-location fetch and a client call for that same
 * location share this cache and only hit Wikimedia once).
 * Intentionally in-memory only — no persistence, per the "don't store
 * the images anywhere" instruction; this is a same-session dedupe,
 * not a cache across deploys/restarts.
 */
const imageCache = new Map<string, LocationImage[]>();

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "ScoutAI/1.0 (https://github.com/scoutai; contact via repo)";
const MIN_RESULTS_TARGET = 6;
const FETCH_TIMEOUT_MS = 3_000; // fail fast — see fetchLocationImages doc comment

interface CommonsExtMetadataField {
  value?: string;
}

interface CommonsImageInfo {
  url?: string;
  descriptionurl?: string;
  extmetadata?: {
    Artist?: CommonsExtMetadataField;
    LicenseShortName?: CommonsExtMetadataField;
    ObjectName?: CommonsExtMetadataField;
  };
}

interface CommonsPage {
  title?: string;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsSearchResponse {
  query?: {
    pages?: Record<string, CommonsPage>;
  };
}

/** Strips HTML tags Commons sometimes embeds in Artist/extmetadata text (e.g. "<a href=...>Name</a>"). */
function stripHtml(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const stripped = value.replace(/<[^>]*>/g, "").trim();
  return stripped.length > 0 ? stripped : undefined;
}

export async function fetchLocationImages(
  query: string,
  minResults: number = MIN_RESULTS_TARGET,
): Promise<LocationImage[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const cached = imageCache.get(trimmedQuery);
  if (cached) return cached;

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: trimmedQuery,
    gsrnamespace: "6", // File namespace
    gsrlimit: String(Math.max(minResults, 10)), // over-fetch a bit; some results won't have usable imageinfo
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    origin: "*",
  });

  try {
    const response = await fetch(`${COMMONS_API}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
      // Wikimedia can be slow under load; don't let one location hang
      // the whole scout run indefinitely.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("Wikimedia Commons search failed:", response.status, trimmedQuery);
      return [];
    }

    const data = (await response.json()) as CommonsSearchResponse;
    const pages = data.query?.pages ?? {};

    const images: LocationImage[] = Object.values(pages)
      .map((page): LocationImage | null => {
        const info = page.imageinfo?.[0];
        if (!info?.url) return null;
        const meta = info.extmetadata;
        return {
          url: info.url,
          title: page.title ?? "Untitled",
          author: stripHtml(meta?.Artist?.value),
          license: stripHtml(meta?.LicenseShortName?.value),
          filePageUrl: info.descriptionurl ?? info.url,
        };
      })
      .filter((img): img is LocationImage => img !== null)
      .slice(0, minResults);

    imageCache.set(trimmedQuery, images);
    return images;
  } catch (err) {
    console.error("Wikimedia Commons fetch error:", err instanceof Error ? err.message : err, trimmedQuery);
    return [];
  }
}