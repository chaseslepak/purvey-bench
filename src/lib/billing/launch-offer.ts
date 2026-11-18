import type Stripe from "stripe";

/**
 * Launch pricing for brokers (Chase, Nov 17 2026). Spots trickle out in order:
 *   1. Founding Broker: the first 10 brokerages get 12 months free.
 *   2. Charter Broker: the next 25 get 50% off for 12 months ($50 a month).
 *   3. Everyone after that pays the list price, $100 a month.
 *
 * Each tier is a Stripe coupon with a promotion code whose max_redemptions is
 * the number of spots, so Stripe is the single source of truth for what's left.
 * The app applies the open tier at checkout by itself; nobody types a code.
 */
export const LIST_PRICE = 100;

export type OfferTier = {
  key: "founding" | "charter";
  name: string;
  code: string;
  spots: number;
  percentOff: number;
  months: number;
};

export const TIERS: readonly OfferTier[] = [
  { key: "founding", name: "Founding Broker", code: "FOUNDING10", spots: 10, percentOff: 100, months: 12 },
  { key: "charter", name: "Charter Broker", code: "CHARTER25", spots: 25, percentOff: 50, months: 12 },
] as const;

/** What Stripe says about one tier. left is null when it couldn't be read. */
export type TierState = { tier: OfferTier; left: number | null; promoId: string | null };
/** The tier a new brokerage gets right now. */
export type CurrentOffer = { tier: OfferTier; left: number; promoId: string };

/** Pure: spots left from a coupon's own counters (null when unknown). */
export function spotsLeftFrom(
  coupon: Pick<Stripe.Coupon, "max_redemptions" | "times_redeemed" | "valid"> | null,
  fallbackSpots: number,
): number | null {
  if (!coupon) return null;
  if (!coupon.valid) return 0;
  const max = coupon.max_redemptions ?? fallbackSpots;
  return Math.max(0, max - (coupon.times_redeemed ?? 0));
}

/**
 * Pure: the first tier with spots left, in order. Returns null when every tier
 * is used up (list price), and undefined when a tier can't be read, so pages
 * show plain copy rather than skip ahead and promise the wrong deal.
 */
export function pickOffer(states: TierState[]): CurrentOffer | null | undefined {
  for (const tier of TIERS) {
    const s = states.find((x) => x.tier.key === tier.key);
    if (!s || s.left === null) return undefined;
    if (s.left > 0 && s.promoId) return { tier, left: s.left, promoId: s.promoId };
  }
  return null;
}

/** Monthly price during the offer, in dollars. */
export function offerMonthly(tier: OfferTier): number {
  return Math.round((LIST_PRICE * (100 - tier.percentOff)) / 100);
}

/** One line of copy for the open offer, or null. Never prints a code. */
export function offerLine(offer: CurrentOffer | null | undefined): string | null {
  if (!offer) return null;
  const { tier, left } = offer;
  const deal = tier.percentOff >= 100
    ? `your first ${tier.months} months free`
    : `$${offerMonthly(tier)} a month for your first ${tier.months} months (${tier.percentOff}% off)`;
  return `${tier.name} offer: ${deal}, applied automatically at checkout. ${left} of ${tier.spots} spots left, then $${LIST_PRICE} a month.`;
}

/** What comes after the open tier, so brokers see the ladder. */
export function nextTierNote(offer: CurrentOffer | null | undefined): string | null {
  if (!offer) return null;
  const i = TIERS.findIndex((t) => t.key === offer.tier.key);
  const next = TIERS[i + 1];
  if (!next) return `After that, new listings are $${LIST_PRICE} a month.`;
  return `After that, the next ${next.spots} brokerages get ${next.percentOff}% off for ${next.months} months.`;
}

/** Short label for buttons and price cards. */
export function offerPrice(offer: CurrentOffer | null | undefined): { price: string; per: string; cta: string } {
  if (!offer) return { price: `$${LIST_PRICE}`, per: "/ month", cta: `Start monthly at $${LIST_PRICE}` };
  if (offer.tier.percentOff >= 100) return { price: "$0", per: `for ${offer.tier.months} months`, cta: `Start free for ${offer.tier.months} months` };
  const m = offerMonthly(offer.tier);
  return { price: `$${m}`, per: `/ month for ${offer.tier.months} months`, cta: `Start at $${m} a month` };
}
