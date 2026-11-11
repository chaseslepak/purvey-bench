import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { authCookieOptions, env } from "@/lib/env";

/** Supabase client for Server Components, Server Actions and Route Handlers. Uses the anon key + the user's session; RLS applies. */
export async function createClient() {
  const cookieStore = await cookies();
  const h = await headers();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookieOptions: authCookieOptions(h.get("x-forwarded-host") ?? h.get("host")),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy refreshes sessions.
        }
      },
    },
  });
}
