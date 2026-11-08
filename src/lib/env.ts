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

export const authCookieOptions = {
  domain: env.cookieDomain,
  path: "/",
  sameSite: "lax" as const,
  secure: env.isProd,
};
