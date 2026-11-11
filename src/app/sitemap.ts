import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { env, supabaseConfigured } from "@/lib/env";
import { APP_URL } from "@/lib/site";

export const revalidate = 3600;

/** Public pages plus every live broker profile (anon key: RLS shows live listings only). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/find", "/for-brokers", "/pricing"].map((p) => ({ url: `${APP_URL}${p}`, changeFrequency: "weekly" as const }));
  if (!supabaseConfigured()) return pages;
  const db = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
  const { data } = await db.from("broker_listings").select("updated_at, organizations!inner(slug)").eq("status", "live");
  const profiles = (data ?? []).map((l) => ({
    url: `${APP_URL}/brokers/${(l.organizations as unknown as { slug: string }).slug}`,
    lastModified: l.updated_at,
    changeFrequency: "weekly" as const,
  }));
  return [...pages, ...profiles];
}
