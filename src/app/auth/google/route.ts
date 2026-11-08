import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured } from "@/lib/env";
import { safeNext } from "@/lib/redirect";
import { APP_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts Google sign-in. Links to this route use target="_top", so Google
 * opens at the top level, never inside the purveycpg.com iframe.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!supabaseConfigured()) return NextResponse.redirect(`${origin}/sign-in?error=config`);
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${APP_URL}/auth/callback?next=${encodeURIComponent(next)}`, skipBrowserRedirect: true },
  });
  if (error || !data.url) return NextResponse.redirect(`${origin}/sign-in?error=oauth`);
  return NextResponse.redirect(data.url);
}
