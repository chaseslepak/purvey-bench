import "server-only";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";
import { FOUNDING, spotsLeftFrom } from "./founding-offer";

export { FOUNDING, foundingLine } from "./founding-offer";

let cache: { at: number; left: number | null } | null = null;
const TTL = 5 * 60_000;

/**
 * Founding spots still open, read from Stripe and cached for five minutes.
 * Returns null when Stripe can't be reached or the code doesn't exist in this
 * environment, so pages fall back to plain $100/month copy instead of a
 * wrong number.
 */
export async function foundingLeft(): Promise<number | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.left;
  let left: number | null = null;
  if (stripeConfigured()) {
    try {
      const codes = await stripe().promotionCodes.list({ code: FOUNDING.code, limit: 1, expand: ["data.promotion.coupon"] });
      const promo = codes.data[0];
      const coupon = promo?.promotion?.coupon;
      left = promo && coupon && typeof coupon !== "string" ? (promo.active ? spotsLeftFrom(coupon) : 0) : null;
    } catch {
      left = null;
    }
  }
  cache = { at: Date.now(), left };
  return left;
}
