import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "./stripe";
import { orgIdFromSubscription, subscriptionRow } from "./subscription";

/**
 * Write a Stripe subscription into `subscriptions` and let the database
 * decide live/paused (sync_listing_status). The only code path, besides
 * admin RPCs, that changes a listing's billing state.
 */
export async function syncSubscription(subOrId: Stripe.Subscription | string): Promise<{ orgId: string; listingStatus: string | null } | null> {
  const sub = typeof subOrId === "string" ? await stripe().subscriptions.retrieve(subOrId) : subOrId;
  const db = createAdminClient();

  let orgId = orgIdFromSubscription(sub);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  if (!orgId) {
    const { data } = await db.from("subscriptions").select("org_id").eq("stripe_customer_id", customerId).maybeSingle();
    orgId = data?.org_id ?? null;
  }
  if (!orgId) return null;

  const { data: existing } = await db.from("subscriptions").select("past_due_since, stripe_subscription_id, status").eq("org_id", orgId).maybeSingle();
  // A different subscription than the one on file: an old one must never overwrite a
  // current paying one (e.g. a late update for an unpaid subscription after the broker
  // started a new one). If two are paying at once, keep the first and flag it for Purvey.
  const PAYING = ["active", "trialing", "past_due"];
  if (existing?.stripe_subscription_id && existing.stripe_subscription_id !== sub.id) {
    const currentPaying = PAYING.includes(existing.status ?? "");
    if (currentPaying && !["active", "trialing"].includes(sub.status)) return { orgId, listingStatus: null };
    if (currentPaying && PAYING.includes(sub.status)) {
      await db.from("product_events").insert({ name: "duplicate_subscription", org_id: orgId, props: { kept: existing.stripe_subscription_id, extra: sub.id } });
      return { orgId, listingStatus: null };
    }
  }
  const row = subscriptionRow(sub, orgId, existing?.past_due_since ?? null);
  const { error } = await db.from("subscriptions").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
  if (error) throw error;
  const { data: status, error: e2 } = await db.rpc("sync_listing_status", { p_org: orgId });
  if (e2) throw e2;
  await db.from("product_events").insert({ name: "subscription_synced", org_id: orgId, props: { status: sub.status, listing: status } });
  return { orgId, listingStatus: status as string | null };
}
