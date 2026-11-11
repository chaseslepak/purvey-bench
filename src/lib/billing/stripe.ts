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

/** Bench Listing plans. Prices are looked up by key in Stripe, never hard-coded. */
export const PLANS = {
  monthly: { lookupKey: "bench_listing_monthly", label: "Monthly", price: "$100", per: "/ month", note: "Billed monthly. Cancel any time." },
  annual: { lookupKey: "bench_listing_annual", label: "Annual · early access", price: "$900", per: "/ year", note: "25% off: $75 a month, paid up front for 12 months. Limited to the first 12 brokerages." },
} as const;
export type Plan = keyof typeof PLANS;
export const LISTING_LOOKUP_KEYS: string[] = Object.values(PLANS).map((p) => p.lookupKey);

const cachedPriceId: Partial<Record<Plan, string>> = {};
export async function listingPriceId(plan: Plan = "monthly"): Promise<string> {
  if (cachedPriceId[plan]) return cachedPriceId[plan]!;
  const key = PLANS[plan].lookupKey;
  const prices = await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`No active Stripe price with lookup key ${key}`);
  cachedPriceId[plan] = price.id;
  return price.id;
}
