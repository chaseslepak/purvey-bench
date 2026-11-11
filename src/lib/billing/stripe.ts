import "server-only";
import Stripe from "stripe";

let client: Stripe | undefined;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  // fetch-based client: works on Vercel and honours HTTPS proxies (NODE_USE_ENV_PROXY).
  client ??= new Stripe(key, { appInfo: { name: "Purvey Bench" }, httpClient: Stripe.createFetchHttpClient() });
  return client;
}

/** The one product: Bench Listing, $100/month. Looked up by key, never hard-coded. */
export const LISTING_PRICE_LOOKUP_KEY = "bench_listing_monthly";

let cachedPriceId: string | undefined;
export async function listingPriceId(): Promise<string> {
  if (cachedPriceId) return cachedPriceId;
  const prices = await stripe().prices.list({ lookup_keys: [LISTING_PRICE_LOOKUP_KEY], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`No active Stripe price with lookup key ${LISTING_PRICE_LOOKUP_KEY}`);
  cachedPriceId = price.id;
  return price.id;
}
