import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { env, supabaseConfigured } from "@/lib/env";
import { APP_URL } from "@/lib/site";
import { stateSlug } from "@/lib/state-slug";

export const revalidate = 3600;

/** Public pages, every live broker profile, and a page per covered retailer (anon key: RLS shows live listings only). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/find", "/for-brokers", "/pricing", "/brokers-for", "/brokers-in", "/resources/broker-kit"].map((p) => ({ url: `${APP_URL}${p}`, changeFrequency: "weekly" as const }));
  if (!supabaseConfigured()) return pages;
  const db = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
  const { data } = await db.from("broker_listings").select("updated_at, organizations!inner(slug), broker_retailers(retailers(slug)), broker_states(state_code)").eq("status", "live");
  const profiles = (data ?? []).map((l) => ({
    url: `${APP_URL}/brokers/${(l.organizations as unknown as { slug: string }).slug}`,
    lastModified: l.updated_at,
    changeFrequency: "weekly" as const,
  }));
  // One page per retailer at least one live broker calls on.
  const retailerSlugs = new Set<string>();
  for (const l of (data ?? []) as unknown as { broker_retailers: { retailers: { slug: string } | null }[] }[]) {
    for (const r of l.broker_retailers ?? []) if (r.retailers?.slug) retailerSlugs.add(r.retailers.slug);
  }
  const retailers = [...retailerSlugs].sort().map((slug) => ({ url: `${APP_URL}/brokers-for/${slug}`, changeFrequency: "weekly" as const }));
  // One page per state at least one live broker covers.
  const codes = new Set<string>();
  for (const l of (data ?? []) as unknown as { broker_states: { state_code: string }[] }[]) for (const s of l.broker_states ?? []) codes.add(s.state_code);
  const { data: states } = codes.size ? await db.from("states").select("code, name").in("code", [...codes]) : { data: [] };
  const statePages = (states ?? []).map((s) => ({ url: `${APP_URL}/brokers-in/${stateSlug(s as { name: string })}`, changeFrequency: "weekly" as const }));
  return [...pages, ...profiles, ...retailers, ...statePages];
}
