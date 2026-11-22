import { z } from "zod";

/**
 * Admin "set up a brand" spec: Purvey creates a client brand's account and
 * fills its profile so the owner only has to sign in. Reference lists are
 * given by NAME; names not on a list go into the matching "other" list (or
 * are reported back, for lists that have no "other" column).
 */
const txt = (n: number) => z.string().trim().max(n).optional().nullable().transform((v) => v || null);
const names = z.array(z.string().trim().min(1).max(80).regex(/^[^<>]+$/)).max(60).default([]);
const state = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);

export const brandSetupSchema = z.object({
  brand: z.object({
    name: z.string().trim().min(1).max(120),
    website: z.string().trim().max(200).optional().nullable()
      .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null)),
    hq_city: txt(80),
    hq_state: state.optional().nullable(),
    logo_url: z.url().optional().nullable(),
  }),
  contact: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email().transform((v) => v.toLowerCase()),
    phone: txt(40),
  }),
  profile: z.object({
    about: txt(2000),
    founded_year: z.number().int().min(1800).max(2100).optional().nullable(),
    stage: z.enum(["launching", "regional", "national", "established"]).optional().nullable(),
    annual_revenue_band: z.enum(["pre_revenue", "under_250k", "250k_1m", "1m_5m", "5m_20m", "20m_plus"]).optional().nullable(),
    current_doors: z.number().int().min(0).max(1_000_000).optional().nullable(),
    categories: names, current_retailers: names, current_distributors: names, current_channels: names,
    current_states: z.array(state).max(60).default([]),
    target_retailers: names, target_distributors: names, target_channels: names,
    target_regions: z.array(z.string().trim().toLowerCase().regex(/^[a-z]{2,20}$/)).max(20).default([]),
    target_states: z.array(state).max(60).default([]),
    certifications: z.array(z.enum(["organic", "non_gmo", "gluten_free", "vegan", "kosher", "halal", "keto", "paleo", "fair_trade", "b_corp", "women_owned", "minority_owned", "veteran_owned", "plant_based", "whole30"])).max(15).default([]),
    storage: z.enum(["ambient", "refrigerated", "frozen"]).optional().nullable(),
    timeline: z.enum(["now", "3_months", "6_months", "exploring"]).optional().nullable(),
    commission_pref: z.enum(["pct_net_sales", "retainer_plus_pct", "retainer_only"]).optional().nullable(),
    max_rate: z.number().min(0).max(100).optional().nullable(),
    max_retainer: z.number().min(0).max(1_000_000).optional().nullable(),
    trade_budget_band: z.enum(["under_10k", "10k_50k", "50k_150k", "150k_plus"]).optional().nullable(),
    looking_for: txt(2000),
  }).default({} as never),
  products: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    description: txt(1000), size: txt(60),
    case_pack: z.number().int().min(1).max(1000).optional().nullable(),
    msrp: z.number().min(0).max(100000).optional().nullable(),
    wholesale: z.number().min(0).max(100000).optional().nullable(),
    upc: z.string().trim().regex(/^([0-9]{8,14})?$/).optional().nullable().transform((v) => v || null),
    shelf_life_days: z.number().int().min(1).max(3650).optional().nullable(),
    storage: z.enum(["ambient", "refrigerated", "frozen"]).optional().nullable(),
  })).max(100).default([]),
});
export type BrandSetup = z.output<typeof brandSetupSchema>;

type Ref = { id: number; name: string };
const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");

/** Pure: split names into reference ids and leftovers (matched case- and punctuation-insensitively). */
export function resolveNames(list: string[], refs: Ref[]): { ids: number[]; other: string[] } {
  const byName = new Map(refs.map((r) => [norm(r.name), r.id]));
  const ids: number[] = [], other: string[] = [];
  for (const n of list) {
    const id = byName.get(norm(n));
    if (id) { if (!ids.includes(id)) ids.push(id); } else if (!other.includes(n)) other.push(n);
  }
  return { ids, other };
}
