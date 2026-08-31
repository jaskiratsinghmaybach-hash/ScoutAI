/**
 * Parses a leading number out of strings like "85%", "85", or "85 out
 * of 100" as returned by the scout agent for mood_match / era_match.
 * Returns null (not 0) when nothing numeric is found, so callers can
 * tell "no data" apart from "genuinely zero" and render an empty state
 * instead of a fake 0% ring.
 */
export function parsePercent(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0]);
  if (Number.isNaN(num)) return null;
  return Math.max(0, Math.min(100, num));
}

/**
 * Shortens a URL for display (protocol/www stripped, path truncated)
 * while the caller keeps the original full URL for copy/open actions.
 */
export function shortenUrl(url: string, maxLength = 42): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const rest = `${u.pathname}${u.search}`;
    const full = `${host}${rest === "/" ? "" : rest}`;
    if (full.length <= maxLength) return full;
    return `${full.slice(0, maxLength - 1)}…`;
  } catch {
    // Not a parseable URL — fall back to naive truncation rather than
    // throwing, since source data may be messy.
    return url.length <= maxLength ? url : `${url.slice(0, maxLength - 1)}…`;
  }
}

/** Best-effort source/site display name from a URL's hostname. */
export function sourceNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    const name = parts.length > 2 ? parts[parts.length - 2] : parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return url;
  }
}