import { z } from "zod";
import { coverageSummary, topRetailers, type Freq } from "@/lib/coverage";
import { fitScore, type FitBrief, type FitResult } from "@/lib/fit";
import type { Reference } from "@/lib/reference";

export const PAGE_SIZE = 24;

const id = z.coerce.number().int().positive();
export const filtersSchema = z.object({
  state: z.string().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  region: z.string().regex(/^[a-z]{2,20}$/).optional().catch(undefined),
  channel: id.optional().catch(undefined),
  category: id.optional().catch(undefined),
  distributor: id.optional().catch(undefined),
  retailer: id.optional().catch(undefined),
  verified: z.literal("1").optional().catch(undefined),
  taking: z.literal("1").optional().catch(undefined),
  sort: z.enum(["fit", "verified", "recent"]).optional().catch(undefined),
  brief: z.union([z.uuid(), z.literal("profile")]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
});
export type Filters = z.infer<typeof filtersSchema>;

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== "" && v != null));
  return filtersSchema.parse(flat);
}

export type ListingRow = {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  hq: string | null;
  about: string | null;
  states: string[];
  retailers: { retailerId: number | null; name: string; freq: Freq }[];
  channels: number[];
  distributors: number[];
  categories: number[];
  conflicts: number[];
  verified: boolean;
  notTakingNewLines: boolean;
  updatedAt: string;
};

export type BriefRow = {
  id: string; title: string; category_id: number | null; regions: string[]; states: string[];
  channels: number[]; target_retailers: number[]; distributors: number[]; notes: string | null; updated_at: string; archived_at: string | null;
};

export function briefToFit(b: BriefRow, ref: Reference): FitBrief {
  const regionStates = ref.states.filter((s) => b.regions.includes(s.region_code)).map((s) => s.code);
  return {
    states: [...new Set([...b.states, ...regionStates])],
    retailers: b.target_retailers,
    channels: b.channels,
    categoryId: b.category_id,
    distributors: b.distributors,
  };
}

type FilterKey = "state" | "region" | "channel" | "category" | "distributor" | "retailer" | "verified" | "taking";
const FILTER_KEYS: FilterKey[] = ["state", "region", "channel", "category", "distributor", "retailer", "verified", "taking"];

function matches(l: ListingRow, f: Filters, ref: Reference, skip?: FilterKey): boolean {
  if (skip !== "state" && f.state && !l.states.includes(f.state)) return false;
  if (skip !== "region" && f.region) {
    const inRegion = ref.states.filter((s) => s.region_code === f.region).map((s) => s.code);
    if (!l.states.some((s) => inRegion.includes(s))) return false;
  }
  if (skip !== "channel" && f.channel && !l.channels.includes(f.channel)) return false;
  if (skip !== "category" && f.category && !l.categories.includes(f.category)) return false;
  if (skip !== "distributor" && f.distributor && !l.distributors.includes(f.distributor)) return false;
  if (skip !== "retailer" && f.retailer && !l.retailers.some((r) => r.retailerId === f.retailer)) return false;
  if (skip !== "verified" && f.verified && !l.verified) return false;
  if (skip !== "taking" && f.taking && l.notTakingNewLines) return false;
  return true;
}

export type Scored = ListingRow & { fit: FitResult | null };

export type SearchResult = {
  total: number;
  page: number;
  pages: number;
  items: Scored[];
  sort: "fit" | "verified" | "recent";
  loosen: { key: FilterKey; count: number } | null;
};

/**
 * Filter, score and sort. Ranking is by fit only; payment never changes the
 * order. "Verified first" and "recently updated" are explicit viewer choices.
 */
export function search(all: ListingRow[], f: Filters, ref: Reference, brief: FitBrief | null): SearchResult {
  const sort = f.sort ?? (brief ? "fit" : "recent");
  const filtered = all.filter((l) => matches(l, f, ref));
  const scored: Scored[] = filtered.map((l) => ({ ...l, fit: brief ? fitScore(brief, l) : null }));
  scored.sort((a, b) => {
    if (sort === "fit") return (b.fit?.score ?? -1) - (a.fit?.score ?? -1) || a.name.localeCompare(b.name);
    if (sort === "verified") return Number(b.verified) - Number(a.verified) || (b.fit?.score ?? 0) - (a.fit?.score ?? 0) || b.updatedAt.localeCompare(a.updatedAt);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const pages = Math.max(1, Math.ceil(scored.length / PAGE_SIZE));
  const page = Math.min(f.page ?? 1, pages);

  // Empty state: which single filter, removed, would show the most brokers?
  let loosen: SearchResult["loosen"] = null;
  if (scored.length === 0) {
    for (const key of FILTER_KEYS) {
      if (!f[key]) continue;
      const count = all.filter((l) => matches(l, f, ref, key)).length;
      if (count > (loosen?.count ?? 0)) loosen = { key, count };
    }
  }
  return { total: scored.length, page, pages, items: scored.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), sort, loosen };
}

export function cardData(l: Scored, ref: Reference, conflictCategory?: string | null, rating?: { average: number; count: number } | null) {
  const channelNames = l.channels.map((c) => ref.channels.find((x) => x.id === c)?.name).filter(Boolean) as string[];
  return {
    name: l.name,
    logoUrl: l.logoUrl,
    hq: l.hq,
    coverage: coverageSummary(l.states, ref.states, ref.regions),
    channels: channelNames,
    retailers: topRetailers(l.retailers),
    verified: l.verified,
    notTakingNewLines: l.notTakingNewLines,
    fit: l.fit ? { score: l.fit.score, reasons: l.fit.reasons } : null,
    conflict: l.fit?.conflict ? `Lists ${conflictCategory ?? "your category"} as a conflict` : null,
    rating: rating ?? null,
  };
}
