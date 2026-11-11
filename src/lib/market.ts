import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, supabaseConfigured } from "@/lib/env";

export type MarketItem = { kind: "retailer" | "distributor"; id: number; name: string; count: number };

/**
 * Public, anonymous aggregates for the sign-up pages. A cookie-less client,
 * so the pages stay static and refresh hourly (see each page's `revalidate`).
 *   demand   retailers/distributors that 3+ brands are seeking brokers for
 *   coverage retailers/distributors that live brokers on Bench cover
 */
async function load(fn: "public_demand" | "public_coverage", limit: number): Promise<MarketItem[]> {
  if (!supabaseConfigured()) return [];
  try {
    const db = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
    const { data } = await db.rpc(fn, { p_limit: limit });
    return ((data ?? []) as { kind: MarketItem["kind"]; id: number; name: string; brands?: number; brokers?: number }[])
      .map((r) => ({ kind: r.kind, id: r.id, name: r.name, count: Number(r.brands ?? r.brokers ?? 0) }));
  } catch {
    return [];
  }
}
export const loadDemand = (limit = 24) => load("public_demand", limit);
export const loadCoverage = (limit = 24) => load("public_coverage", limit);
