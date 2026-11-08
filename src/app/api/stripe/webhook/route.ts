import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { subscriptionIdFromInvoice } from "@/lib/billing/subscription";
import { syncSubscription } from "@/lib/billing/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

/**
 * Stripe webhook. Signature-verified; idempotent via stripe_events. Listing
 * status changes only here (and through admin RPCs).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return NextResponse.json({ error: "not configured" }, { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  if (!HANDLED.has(event.type)) return NextResponse.json({ received: true, ignored: event.type });

  const db = createAdminClient();
  const { error: dup } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dup) {
    if (dup.code === "23505") return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  try {
    let subId: string | null = null;
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object;
        subId = typeof cs.subscription === "string" ? cs.subscription : cs.subscription?.id ?? null;
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        subId = event.data.object.id;
        break;
      case "invoice.paid":
      case "invoice.payment_failed":
        subId = subscriptionIdFromInvoice(event.data.object);
        if (event.type === "invoice.payment_failed") {
          await db.from("product_events").insert({ name: "payment_failed", props: { invoice: event.data.object.id } });
          // Phase 4 sends the "payment failed" email from here.
        }
        break;
    }
    // Always re-read the subscription so out-of-order events converge on Stripe's current state.
    const result = subId ? await syncSubscription(subId) : null;
    return NextResponse.json({ received: true, synced: result });
  } catch (e) {
    // Let Stripe retry: forget the event so the retry isn't treated as a duplicate.
    await db.from("stripe_events").delete().eq("id", event.id);
    console.error("stripe webhook failed", event.type, e);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
