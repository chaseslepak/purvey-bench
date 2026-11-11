"use server";

import { stripe } from "@/lib/billing/stripe";
import { requestOrigin } from "@/lib/origin";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Stripe Customer Portal: update card, see invoices, cancel. Owners only. */
export async function openBillingPortal(): Promise<{ url?: string; error?: string }> {
  const session = await getSession();
  if (!session?.org || session.org.type !== "broker") return { error: "Only brokerages have billing." };
  if (session.org.memberRole !== "owner") return { error: "Only an owner can manage billing." };
  const db = await createClient();
  const { data: sub } = await db.from("subscriptions").select("stripe_customer_id").eq("org_id", session.org.id).maybeSingle();
  if (!sub?.stripe_customer_id) return { error: "No billing account yet. Submit your listing to start." };
  const portal = await stripe().billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: `${await requestOrigin()}/app/billing` });
  return { url: portal.url };
}
