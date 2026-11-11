/** Central access to environment variables. Secrets are server-only. */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  /** e.g. ".purveycpg.com" in production so the session works inside the purveycpg.com iframe. */
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
  isProd: process.env.NODE_ENV === "production",
};

export function supabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

/**
 * Auth cookie options for a request to `host`. The shared COOKIE_DOMAIN
 * (".purveycpg.com") is applied only when the app is actually served on that
 * domain; browsers reject it on vercel.app previews or localhost, which would
 * silently break sign-in there.
 */
export function cookieDomainFor(host: string | null | undefined): string | undefined {
  const d = env.cookieDomain;
  if (!d || !host) return undefined;
  const bare = d.replace(/^\./, "").toLowerCase();
  const h = host.split(":")[0].toLowerCase();
  return h === bare || h.endsWith(`.${bare}`) ? d : undefined;
}

export function authCookieOptions(host: string | null | undefined) {
  return { domain: cookieDomainFor(host), path: "/", sameSite: "lax" as const, secure: env.isProd };
}
