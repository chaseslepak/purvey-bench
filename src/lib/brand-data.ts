import "server-only";
import { EMPTY_PROFILE, type BrandProfile } from "@/lib/brand-profile";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export type BrandData = {
  org: { id: string; name: string; website: string | null; hq_city: string | null; hq_state: string | null; logo_url: string | null };
  profile: BrandProfile;
  products: { id: string; name: string; description: string | null; size: string | null; case_pack: number | null; msrp: number | null; wholesale: number | null; upc: string | null; shelf_life_days: number | null; storage: string | null }[];
  files: { id: string; name: string; folder: string; size: number; at: string }[];
};

/** A brand's profile, products and data room. RLS decides who may read it. */
export async function loadBrand(db: Db, orgId: string): Promise<BrandData | null> {
  const [org, prof, products, files] = await Promise.all([
    db.from("organizations").select("id, name, website, hq_city, hq_state, logo_url").eq("id", orgId).maybeSingle(),
    db.from("brand_profiles").select("*").eq("org_id", orgId).maybeSingle(),
    db.from("brand_products").select("id, name, description, size, case_pack, msrp, wholesale, upc, shelf_life_days, storage").eq("org_id", orgId).order("sort").order("created_at"),
    db.from("brand_files").select("id, file_name, folder, size_bytes, created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
  ]);
  if (!org.data || !prof.data) return null;
  const p = prof.data as Record<string, unknown>;
  const profile = Object.fromEntries(Object.keys(EMPTY_PROFILE).map((k) => [k, p[k] ?? (EMPTY_PROFILE as Record<string, unknown>)[k]])) as BrandProfile;
  for (const k of ["max_rate", "max_retainer"] as const) profile[k] = profile[k] == null ? null : Number(profile[k]);
  return {
    org: org.data,
    profile,
    products: (products.data ?? []).map((x) => ({ ...x, msrp: x.msrp == null ? null : Number(x.msrp), wholesale: x.wholesale == null ? null : Number(x.wholesale) })),
    files: (files.data ?? []).map((f) => ({ id: f.id, name: f.file_name, folder: f.folder, size: f.size_bytes, at: f.created_at })),
  };
}
