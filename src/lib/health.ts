import "server-only";
import { stripe, stripeConfigured, PLANS } from "@/lib/billing/stripe";
import { currentOffer } from "@/lib/billing/launch";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/env";

export type Check = { ok: boolean; note: string };
export type Health = { ok: boolean; at: string; checks: Record<string, Check> };

/** Stripe errors carry a masked key in their message; report only the kind of failure. */
function stripeProblem(e: unknown) {
  const err = e as { code?: string; type?: string; message?: string };
  if (/expired api key/i.test(err?.message ?? "")) return "the Stripe key has expired";
  if (err?.type === "StripeAuthenticationError") return "Stripe rejected the key";
  if (err?.type === "StripePermissionError") return "the Stripe key lacks a needed permission";
  return `Stripe call failed (${err?.code ?? err?.type ?? "unknown"})`;
}

async function checkStripe(): Promise<Check> {
  if (!stripeConfigured()) return { ok: false, note: "STRIPE_SECRET_KEY is not set" };
  try {
    const prices = await stripe().prices.list({ lookup_keys: [PLANS.monthly.lookupKey], active: true, limit: 1 });
    return prices.data.length ? { ok: true, note: "monthly listing price found" } : { ok: false, note: "no active price with lookup key bench_listing_monthly" };
  } catch (e) {
    return { ok: false, note: stripeProblem(e) };
  }
}

async function checkOffer(): Promise<Check> {
  const o = await currentOffer({ fresh: true });
  if (o === undefined) return { ok: false, note: "launch codes FOUNDING10 / CHARTER25 can't be read" };
  if (o === null) return { ok: true, note: "launch tiers used up; list price" };
  return { ok: true, note: `${o.tier.name}: ${o.left} of ${o.tier.spots} left` };
}

async function checkDb(): Promise<Check> {
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, note: "Supabase is not configured" };
  try {
    const db = createAdminClient();
    const { error } = await db.from("regions").select("code", { count: "exact", head: true });
    return error ? { ok: false, note: `database query failed (${error.code ?? "error"})` } : { ok: true, note: "reachable" };
  } catch {
    return { ok: false, note: "database unreachable" };
  }
}

/** The newest migration's table. Fails when production is behind the code. */
async function checkMigrations(): Promise<Check> {
  try {
    const { error } = await createAdminClient().from("saved_searches").select("id", { count: "exact", head: true });
    return error ? { ok: false, note: "migration 20261118001800 (saved searches, responsiveness) is not applied" } : { ok: true, note: "up to date" };
  } catch {
    return { ok: false, note: "couldn't check" };
  }
}

function checkEnv(name: string, why: string): Check {
  return process.env[name] ? { ok: true, note: "set" } : { ok: false, note: `${name} is not set (${why})` };
}

let cached: { at: number; h: Health } | null = null;

/** Everything a broker or brand needs to work end to end. Cached 60s so the public endpoint can't be used to hammer Stripe. */
export async function health({ fresh = false } = {}): Promise<Health> {
  if (!fresh && cached && Date.now() - cached.at < 60_000) return cached.h;
  const [stripeCheck, offer, db, migrations] = await Promise.all([checkStripe(), checkOffer(), checkDb(), checkMigrations()]);
  const checks: Record<string, Check> = {
    stripe: stripeCheck,
    launch_offer: offer,
    stripe_webhook: checkEnv("STRIPE_WEBHOOK_SECRET", "paid listings won't go live"),
    database: db,
    migrations,
    email: checkEnv("RESEND_API_KEY", "no notifications or digests"),
    cron: checkEnv("CRON_SECRET", "digests and listing sync won't run"),
  };
  const h = { ok: Object.values(checks).every((c) => c.ok), at: new Date().toISOString(), checks };
  cached = { at: Date.now(), h };
  return h;
}
