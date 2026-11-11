import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing. Uses token_hash (not PKCE) so a link opened in a
 * different browser or device than the one that requested it still works.
 * Supabase email template: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  const next = safeNext(extractNext(searchParams.get("next")));

  if (tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(next.startsWith("/") ? `${origin}${next}` : next);
  }
  return NextResponse.redirect(`${origin}/sign-in?error=link`);
}

/** `next` may arrive as a full emailRedirectTo URL (…/auth/confirm?next=/app); unwrap it. */
function extractNext(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.pathname === "/auth/confirm") return u.searchParams.get("next");
    return raw;
  } catch {
    return raw;
  }
}
