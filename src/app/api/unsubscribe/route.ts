import { NextResponse, type NextRequest } from "next/server";
import { UNSUBSCRIBABLE, type Kind } from "@/lib/email/kinds";
import { verifyUnsubscribe } from "@/lib/email/links";
import { createAdminClient } from "@/lib/supabase/admin";

async function apply(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const k = (req.nextUrl.searchParams.get("k") ?? "") as Kind;
  const s = req.nextUrl.searchParams.get("s") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(u) || !UNSUBSCRIBABLE[k] || !verifyUnsubscribe(u, k, s)) return false;
  const db = createAdminClient();
  const { data } = await db.from("notification_prefs").select("email_opt_outs").eq("user_id", u).maybeSingle();
  const outs = { ...((data?.email_opt_outs as Record<string, boolean>) ?? {}), [k]: true };
  // Digest and new-message opt-outs also switch the inbox preference off, so the setting page agrees.
  const extra = k === "new_message" || k === "digest" ? { email_new_message: "off" } : k === "weekly_summary" ? { email_weekly_summary: false } : {};
  await db.from("notification_prefs").upsert({ user_id: u, email_opt_outs: outs, ...extra });
  return true;
}

/** One-click unsubscribe (RFC 8058): mail clients POST here. */
export async function POST(req: NextRequest) {
  return (await apply(req)) ? new NextResponse(null, { status: 200 }) : NextResponse.json({ error: "invalid link" }, { status: 400 });
}

/** A person clicking the link in the email. */
export async function GET(req: NextRequest) {
  const ok = await apply(req);
  return NextResponse.redirect(new URL(ok ? "/unsubscribed" : "/unsubscribed?error=1", req.url), 303);
}
