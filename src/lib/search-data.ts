import "server-only";
import type { Freq } from "@/lib/coverage";
import type { ListingRow } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

type Raw = {
  id: string; org_id: string; about: string | null; channels: number[]; distributors: number[]; categories: number[]; conflicts: number[];
  other_channels?: string[]; other_distributors?: string[]; other_categories?: string[]; other_conflicts?: string[];
  not_taking_new_lines: boolean; verified_at: string | null; updated_at: string;
  organizations: { name: string; slug: string; logo_url: string | null; hq_city: string | null; hq_state: string | null };
  broker_states: { state_code: string }[];
  broker_retailers: { retailer_id: number | null; custom_name: string | null; call_frequency: Freq; retailers: { name: string } | null }[];
};

const SELECT = `id, org_id, about, channels, distributors, categories, conflicts, other_channels, other_distributors, other_categories, other_conflicts, not_taking_new_lines, verified_at, updated_at,
  organizations!inner(name, slug, logo_url, hq_city, hq_state),
  broker_states(state_code),
  broker_retailers(retailer_id, custom_name, call_frequency, retailers(name))`;

export function toRow(r: Raw): ListingRow {
  return {
    id: r.id, orgId: r.org_id, slug: r.organizations.slug, name: r.organizations.name, logoUrl: r.organizations.logo_url,
    hq: [r.organizations.hq_city, r.organizations.hq_state].filter(Boolean).join(", ") || null,
    about: r.about,
    states: r.broker_states.map((s) => s.state_code),
    retailers: r.broker_retailers.map((b) => ({ retailerId: b.retailer_id, name: b.custom_name ?? b.retailers?.name ?? "Retailer", freq: b.call_frequency })),
    channels: r.channels, distributors: r.distributors, categories: r.categories, conflicts: r.conflicts,
    other: { channels: r.other_channels ?? [], distributors: r.other_distributors ?? [], categories: r.other_categories ?? [], conflicts: r.other_conflicts ?? [] },
    verified: Boolean(r.verified_at), notTakingNewLines: r.not_taking_new_lines, updatedAt: r.updated_at,
  };
}

/** Live listings only (RLS limits anon/brands to visible ones; this also hides a broker's own draft). */
export async function loadLiveListings(): Promise<ListingRow[]> {
  const db = await createClient();
  const { data, error } = await db.from("broker_listings").select(SELECT).eq("status", "live").eq("admin_paused", false);
  if (error) throw error;
  return (data as unknown as Raw[]).map(toRow);
}

export async function loadListingBySlug(slug: string): Promise<ListingRow | null> {
  const db = await createClient();
  const { data } = await db.from("broker_listings").select(SELECT).eq("organizations.slug", slug).maybeSingle();
  return data ? toRow(data as unknown as Raw) : null;
}


export type Rating = { average: number; count: number };
/** Average star rating and review count per listing (display only, never used for ranking). */
export async function loadRatings(ids: string[]): Promise<Map<string, Rating>> {
  if (!ids.length) return new Map();
  const db = await createClient();
  const { data } = await db.rpc("listing_ratings", { p_listings: ids });
  return new Map(((data ?? []) as { listing_id: string; average: number; reviews: number }[]).map((r) => [r.listing_id, { average: Number(r.average), count: Number(r.reviews) }]));
}
