/**
 * Embedding on purveycpg.com. Shared by next.config (frame-ancestors), the
 * in-app bridge (who it reports to) and /embed.js (the Webflow snippet).
 * EMBED_EXTRA_ORIGINS (comma-separated, e.g. the Webflow staging domain)
 * adds hosts that may frame the app, for previews.
 */
export const EMBED_ORIGINS = ["https://purveycpg.com", "https://www.purveycpg.com"];

export function embedOrigins(extra = process.env.EMBED_EXTRA_ORIGINS ?? process.env.NEXT_PUBLIC_EMBED_EXTRA_ORIGINS ?? ""): string[] {
  const more = extra.split(",").map((s) => s.trim()).filter((s) => /^https:\/\/[a-z0-9.-]+$/i.test(s));
  return [...EMBED_ORIGINS, ...more];
}

/**
 * Pages that open full-window on bench.purveycpg.com instead of inside the
 * embed: sign-in (Google and Stripe refuse to run in a frame) and the
 * signed-in workspace, which needs the whole screen.
 */
export const BREAKOUT = /^\/(app|admin|sign-in|sign-up|auth|invite|unsubscribed)(\/|$|\?|#)/;

/** A path that is safe to put in the iframe: same-site, absolute, no scheme. */
export function safePath(p: string | null | undefined): string {
  if (!p || !p.startsWith("/") || p.startsWith("//") || /[\\\s]/.test(p) || p.length > 500) return "/";
  return p;
}
