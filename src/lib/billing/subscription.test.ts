import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { hasListingAccess, orgIdFromSubscription, planOf, subscriptionIdFromInvoice, subscriptionRow } from "./subscription";

const ORG = "11111111-2222-4333-8444-555555555555";
function sub(over: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, metadata: { org_id: ORG },
    items: { data: [{ current_period_end: 1800000000, price: { id: "price_1" } }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

describe("subscriptionRow", () => {
  it("maps an active subscription, with the period end from the items", () => {
    const r = subscriptionRow(sub(), ORG, null);
    expect(r).toMatchObject({ org_id: ORG, stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", stripe_price_id: "price_1", status: "active", cancel_at_period_end: false, past_due_since: null });
    expect(r.current_period_end).toBe(new Date(1800000000 * 1000).toISOString());
  });
  it("starts the 7-day grace clock on the first past_due and keeps it", () => {
    const now = new Date("2027-04-01T00:00:00Z");
    expect(subscriptionRow(sub({ status: "past_due" }), ORG, null, now).past_due_since).toBe(now.toISOString());
    expect(subscriptionRow(sub({ status: "past_due" }), ORG, "2027-03-28T00:00:00.000Z", now).past_due_since).toBe("2027-03-28T00:00:00.000Z");
  });
  it("clears the grace clock once paid", () => {
    expect(subscriptionRow(sub({ status: "active" }), ORG, "2027-03-28T00:00:00.000Z").past_due_since).toBeNull();
  });
});

describe("ids", () => {
  it("reads the org from metadata only when it is a uuid", () => {
    expect(orgIdFromSubscription(sub())).toBe(ORG);
    expect(orgIdFromSubscription(sub({ metadata: { org_id: "x'; drop" } }))).toBeNull();
  });
  it("finds an invoice's subscription under parent", () => {
    expect(subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: "sub_9" } } } as unknown as Stripe.Invoice)).toBe("sub_9");
    expect(subscriptionIdFromInvoice({ parent: null } as unknown as Stripe.Invoice)).toBeNull();
  });
});

describe("plans and access", () => {
  it("reads the plan from the price interval", () => {
    const withInterval = (interval: string) => sub({ items: { data: [{ current_period_end: 1, price: { id: "p", recurring: { interval } } }] } } as unknown as Partial<Stripe.Subscription>);
    expect(planOf(withInterval("year"))).toBe("annual");
    expect(planOf(withInterval("month"))).toBe("monthly");
    expect(planOf(sub())).toBeNull();
  });
  it("gives access only to paid or comped brokers; cancelled can pay again", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    expect(hasListingAccess(null)).toBe(false);
    expect(hasListingAccess({ comped: true })).toBe(true);
    expect(hasListingAccess({ status: "active" })).toBe(true);
    expect(hasListingAccess({ status: "past_due" })).toBe(true);
    expect(hasListingAccess({ status: "incomplete" })).toBe(false);
    expect(hasListingAccess({ status: "canceled", current_period_end: "2027-02-01T00:00:00Z" }, now)).toBe(false);
    expect(hasListingAccess({ status: "canceled", current_period_end: "2026-12-01T00:00:00Z" }, now)).toBe(false);
    expect(hasListingAccess({ status: null })).toBe(false);
  });
});
