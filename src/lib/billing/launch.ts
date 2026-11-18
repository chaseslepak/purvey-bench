import "server-only";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";
import { TIERS, pickOffer, spotsLeftFrom, type CurrentOffer, type TierState } from "./launch-offer";

export { TIERS, offerLine, nextTierNote, offerPrice, LIST_PRICE } from "./launch-offer";
export type { CurrentOffer } from "./launch-offer";

/** Which kind of Stripe key is configured, never the key itself. */
function keyMode() {
  const k = process.env.STRIPE_SECRET_KEY ?? "";
  return k.startsWith("sk_live") ? "live" : k.startsWith("sk_test") ? "test" : k.startsWith("rk_live") ? "restricted live" : k.startsWith("rk_test") ? "restricted test" : "no";
}

let cache: { at: number; offer: CurrentOffer | null | undefined } | null = null;
const TTL = 60_000;

async function readTier(tier: (typeof TIERS)[number]): Promise<TierState> {
  try {
    const codes = await stripe().promotionCodes.list({ code: tier.code, limit: 1, expand: ["data.promotion.coupon"] });
    const promo = codes.data[0];
    const coupon = promo?.promotion?.coupon;
    if (!promo || !coupon || typeof coupon === "string") {
      console.warn(`launch offer: ${tier.code} not found (${codes.data.length} codes, ${keyMode()} key)`);
      return { tier, left: null, promoId: null };
    }
    const left = promo.active ? spotsLeftFrom(coupon, tier.spots) : 0;
    const promoMax = promo.max_redemptions;
    const promoLeft = promoMax == null ? left : Math.max(0, promoMax - (promo.times_redeemed ?? 0));
    return { tier, left: left == null ? null : Math.min(left, promoLeft ?? left), promoId: promo.id };
  } catch (e) {
    console.warn(`launch offer: reading ${tier.code} failed (${keyMode()} key)`, (e as Error)?.message);
    return { tier, left: null, promoId: null };
  }
}

/**
 * The launch tier open right now, read from Stripe and cached for a minute.
 * null = every tier is used up (list price). undefined = Stripe couldn't be
 * read or a code is missing in this environment, so callers fall back to
 * plain $100/month copy and checkout lets brokers type a code instead.
 */
export async function currentOffer(opts: { fresh?: boolean } = {}): Promise<CurrentOffer | null | undefined> {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL) return cache.offer;
  if (!stripeConfigured()) return undefined;
  const states = await Promise.all(TIERS.map(readTier));
  const offer = pickOffer(states);
  cache = { at: Date.now(), offer };
  return offer;
}

/** Drop the cache after a checkout completes, so the count updates at once. */
export function forgetOffer() {
  cache = null;
}
