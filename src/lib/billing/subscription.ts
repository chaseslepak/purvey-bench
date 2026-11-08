import type Stripe from "stripe";

export type SubscriptionRow = {
  org_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  past_due_since: string | null;
};

const id = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

/**
 * Map a Stripe subscription to our `subscriptions` row. Pure, so it is unit
 * tested. `previousPastDueSince` keeps the grace clock from restarting on
 * every past_due update; it clears once the subscription is no longer past_due.
 * (Since API 2025-03, the period end lives on the subscription items.)
 */
export function subscriptionRow(
  sub: Stripe.Subscription,
  orgId: string,
  previousPastDueSince: string | null,
  now: Date = new Date(),
): SubscriptionRow {
  const periodEnd = Math.max(0, ...sub.items.data.map((i) => i.current_period_end ?? 0));
  return {
    org_id: orgId,
    stripe_customer_id: id(sub.customer)!,
    stripe_subscription_id: sub.id,
    stripe_price_id: sub.items.data[0]?.price?.id ?? null,
    status: sub.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    past_due_since: sub.status === "past_due" ? previousPastDueSince ?? now.toISOString() : null,
  };
}

/** The org a subscription belongs to: from metadata set at checkout. */
export function orgIdFromSubscription(sub: Stripe.Subscription): string | null {
  const v = sub.metadata?.org_id;
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

/** The subscription an invoice is for (moved under `parent` in API 2025-03). */
export function subscriptionIdFromInvoice(inv: Stripe.Invoice): string | null {
  return id(inv.parent?.subscription_details?.subscription ?? null);
}
