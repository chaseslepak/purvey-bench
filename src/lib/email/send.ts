import "server-only";
import { Resend } from "resend";
import { APP_URL } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { composeEmail } from "./compose";
import type { Kind } from "./kinds";

/**
 * Email delivery from the outbox.
 * EMAIL_TEST_MODE=1 (preview/dev): every email goes to Resend's test inbox
 * delivered@resend.dev from onboarding@resend.dev, so nobody real is emailed.
 */
const testMode = () => process.env.EMAIL_TEST_MODE === "1" || !process.env.EMAIL_FROM;
const from = () => (testMode() ? "Purvey Bench <onboarding@resend.dev>" : process.env.EMAIL_FROM!);

let client: Resend | undefined;
export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}
function resend() {
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}

type Row = { id: number; to_user_id: string | null; to_email: string | null; kind: Kind; payload: Record<string, unknown>; attempts: number };

async function deliver(to: string, kind: Kind, payload: Record<string, unknown>, userId: string | null, items?: Record<string, unknown>[]) {
  const e = await composeEmail(kind, payload, { appUrl: APP_URL, userId, items });
  const { data, error } = await resend().emails.send({
    from: from(),
    to: testMode() ? "delivered@resend.dev" : to,
    subject: e.subject,
    html: e.html,
    text: e.text,
    headers: e.headers,
    tags: [{ name: "kind", value: kind }],
  });
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

async function emailsFor(userIds: string[]) {
  if (!userIds.length) return new Map<string, string>();
  const { data } = await createAdminClient().from("users").select("id, email, suspended_at").in("id", userIds);
  return new Map((data ?? []).filter((u) => !u.suspended_at).map((u) => [u.id as string, u.email as string]));
}

/** Send due, non-digest emails. Safe to call often and concurrently-ish (claims rows by id). */
export async function processOutbox(limit = 50): Promise<{ sent: number; failed: number }> {
  if (!emailConfigured()) return { sent: 0, failed: 0 };
  const db = createAdminClient();
  const { data: rows } = await db.from("email_outbox").select("id, to_user_id, to_email, kind, payload, attempts")
    .is("sent_at", null).eq("digest", false).lte("send_after", new Date().toISOString()).lt("attempts", 5).order("id").limit(limit);
  const due = (rows ?? []) as Row[];
  const emails = await emailsFor(due.map((r) => r.to_user_id).filter(Boolean) as string[]);
  let sent = 0, failed = 0;
  for (const r of due) {
    // Claim: bump attempts first so a parallel run skips it.
    const { data: claimed } = await db.from("email_outbox").update({ attempts: r.attempts + 1 }).eq("id", r.id).eq("attempts", r.attempts).is("sent_at", null).select("id");
    if (!claimed?.length) continue;
    const to = r.to_email ?? (r.to_user_id ? emails.get(r.to_user_id) : undefined);
    if (!to) { await db.from("email_outbox").update({ sent_at: new Date().toISOString(), last_error: "no recipient" }).eq("id", r.id); continue; }
    try {
      await deliver(to, r.kind, r.payload, r.to_user_id);
      await db.from("email_outbox").update({ sent_at: new Date().toISOString(), last_error: null }).eq("id", r.id);
      sent++;
    } catch (e) {
      // Exponential-ish backoff.
      await db.from("email_outbox").update({ last_error: String(e).slice(0, 500), send_after: new Date(Date.now() + 2 ** r.attempts * 60_000).toISOString() }).eq("id", r.id);
      failed++;
    }
  }
  return { sent, failed };
}

/** Daily: one digest per person for their 'daily' preference rows (and admins' notices). */
export async function sendDigests(): Promise<{ digests: number }> {
  if (!emailConfigured()) return { digests: 0 };
  const db = createAdminClient();
  const { data: rows } = await db.from("email_outbox").select("id, to_user_id, kind, payload").is("sent_at", null).eq("digest", true).limit(5000);
  const byUser = new Map<string, { ids: number[]; items: Record<string, unknown>[] }>();
  for (const r of rows ?? []) {
    const g = byUser.get(r.to_user_id) ?? { ids: [], items: [] };
    g.ids.push(r.id); g.items.push(r.payload as Record<string, unknown>);
    byUser.set(r.to_user_id, g);
  }
  const emails = await emailsFor([...byUser.keys()]);
  let digests = 0;
  for (const [userId, g] of byUser) {
    const to = emails.get(userId);
    try {
      if (to) { await deliver(to, "digest", {}, userId, g.items); digests++; }
      await db.from("email_outbox").update({ sent_at: new Date().toISOString() }).in("id", g.ids);
    } catch (e) {
      await db.from("email_outbox").update({ last_error: String(e).slice(0, 500) }).in("id", g.ids);
    }
  }
  return { digests };
}

/** Weekly: a summary of views and conversations for brokerage members who want one. */
export async function enqueueWeeklySummaries(): Promise<number> {
  const db = createAdminClient();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: listings } = await db.from("broker_listings").select("id, org_id").eq("status", "live");
  let n = 0;
  for (const l of listings ?? []) {
    const count = async (type: string) => (await db.from("profile_events").select("*", { count: "exact", head: true }).eq("listing_id", l.id).eq("type", type).gte("created_at", since)).count ?? 0;
    const conv = (await db.from("conversations").select("*", { count: "exact", head: true }).eq("broker_org_id", l.org_id).gte("created_at", since)).count ?? 0;
    const payload = { impressions: await count("search_impression"), views: await count("profile_view"), reveals: await count("contact_reveal"), conversations: conv };
    const { data: members } = await db.from("org_members").select("user_id, notification_prefs:notification_prefs!inner(email_weekly_summary, email_opt_outs)").eq("org_id", l.org_id);
    for (const m of (members ?? []) as unknown as { user_id: string; notification_prefs: { email_weekly_summary: boolean; email_opt_outs: Record<string, boolean> } }[]) {
      if (!m.notification_prefs?.email_weekly_summary || m.notification_prefs.email_opt_outs?.weekly_summary) continue;
      await db.from("email_outbox").insert({ to_user_id: m.user_id, kind: "weekly_summary", payload });
      n++;
    }
  }
  return n;
}
