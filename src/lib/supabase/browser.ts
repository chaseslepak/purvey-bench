"use client";
import { createBrowserClient } from "@supabase/ssr";
import { authCookieOptions, env } from "@/lib/env";

/** Browser client (anon key only; never the service-role key). */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey, { cookieOptions: authCookieOptions(window.location.host) });
}
