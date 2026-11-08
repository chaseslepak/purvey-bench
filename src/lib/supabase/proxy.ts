import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, env, supabaseConfigured } from "@/lib/env";

/** Refreshes the Supabase session cookie on every request and returns the signed-in user id, if any. */
export async function updateSession(request: NextRequest) {
  request.headers.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request });
  if (!supabaseConfigured()) return { response, userId: null as string | null };

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookieOptions: authCookieOptions(request.headers.get("x-forwarded-host") ?? request.headers.get("host")),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // getClaims() verifies the JWT signature; do not trust getSession() here.
  const { data } = await supabase.auth.getClaims();
  return { response, userId: (data?.claims?.sub as string | undefined) ?? null };
}
