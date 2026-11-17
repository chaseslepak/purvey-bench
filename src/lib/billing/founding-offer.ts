import type Stripe from "stripe";

/**
 * Founding Broker offer (Chase, Nov 17 2026): the first 10 brokerages get
 * 12 months free with a promotion code, then the normal $100 a month. It
 * replaces the $900 early-access year. The code lives in Stripe (coupon:
 * 100% off for 12 months, 10 redemptions, Bench Listing only); brokers type
 * it on the Stripe Checkout page, so the app never applies it by itself.
 */
export const FOUNDING = { code: "FOUNDING10", spots: 10, months: 12 } as const;

/** Pure: spots left from the coupon's own counters (null when unknown). */
export function spotsLeftFrom(coupon: Pick<Stripe.Coupon, "max_redemptions" | "times_redeemed" | "valid"> | null): number | null {
  if (!coupon) return null;
  if (!coupon.valid) return 0;
  const max = coupon.max_redemptions ?? FOUNDING.spots;
  return Math.max(0, max - (coupon.times_redeemed ?? 0));
}

/** One line of copy for the offer, or null when no spots are open (or unknown). */
export function foundingLine(left: number | null): string | null {
  if (!left || left <= 0) return null;
  return `Founding Broker: the first ${FOUNDING.spots} brokerages get their first ${FOUNDING.months} months free with a Founding Broker code. ${left} of ${FOUNDING.spots} spots left.`;
}
