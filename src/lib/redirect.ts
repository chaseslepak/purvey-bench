/**
 * Only allow redirects to our own paths, or to the Webflow embed page
 * (purveycpg.com/bench) when sign-in started inside the iframe.
 */
const ALLOWED_ABSOLUTE = /^https:\/\/(www\.)?purveycpg\.com\/bench(\/|\?|$)/;

export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next) return fallback;
  // Control characters and backslashes can turn "/\t/evil.com" into "//evil.com" in browsers.
  if (/[\x00-\x20\\]/.test(next)) return fallback;
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  if (ALLOWED_ABSOLUTE.test(next)) return next;
  return fallback;
}
