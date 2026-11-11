"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DATA_ROOM_FOLDERS } from "@/lib/brand-profile";
import { verifyStoredUpload } from "@/lib/files";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type R = { ok?: boolean; error?: string };
const uuid = z.uuid();
const ids = z.array(z.number().int().positive()).max(200);
const codes = (re: RegExp) => z.array(z.string().regex(re)).max(60);
const names = z.array(z.string().trim().min(1).max(80).regex(/^[^<>]+$/)).max(20);
const txt = (n: number) => z.string().trim().max(n).transform((v) => v || null).nullable();
const opt = <T extends readonly [string, ...string[]]>(vals: T) => z.enum(vals).nullable();

async function brand() {
  const s = await getSession();
  if (s?.org?.type !== "brand") throw new Error("Brands only.");
  return { s, db: await createClient() };
}
const done = () => { revalidatePath("/app/brand"); revalidatePath("/app"); };

const profileSchema = z.object({
  about: txt(2000), founded_year: z.number().int().min(1800).max(2100).nullable(),
  annual_revenue_band: opt(["pre_revenue", "under_250k", "250k_1m", "1m_5m", "5m_20m", "20m_plus"]),
  stage: opt(["launching", "regional", "national", "established"]),
  categories: ids, other_categories: names, certifications: z.array(z.string().regex(/^[a-z_]{2,20}$/)).max(20),
  storage: opt(["ambient", "refrigerated", "frozen"]),
  current_retailers: ids, other_current_retailers: names, current_distributors: ids, other_current_distributors: names, current_states: codes(/^[A-Z]{2}$/), current_channels: ids, other_current_channels: names,
  current_doors: z.number().int().min(0).max(1_000_000).nullable(),
  target_retailers: ids, other_target_retailers: names, target_distributors: ids, other_target_distributors: names, target_regions: codes(/^[a-z]{2,20}$/), target_states: codes(/^[A-Z]{2}$/), target_channels: ids, other_target_channels: names,
  timeline: opt(["now", "3_months", "6_months", "exploring"]),
  commission_pref: opt(["pct_net_sales", "retainer_plus_pct", "retainer_only"]),
  max_rate: z.number().min(0).max(100).nullable(), max_retainer: z.number().min(0).max(1_000_000).nullable(),
  trade_budget_band: opt(["under_10k", "10k_50k", "50k_150k", "150k_plus"]),
  looking_for: txt(2000),
}).partial();

export async function saveBrandProfile(patch: z.input<typeof profileSchema>): Promise<R> {
  const { s, db } = await brand();
  const p = profileSchema.safeParse(patch);
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await db.from("brand_profiles").update(p.data).eq("org_id", s.org!.id);
  if (error) return { error: /certification|state|region/.test(error.message) ? "One of those choices isn't valid." : "Couldn't save." };
  done();
  return { ok: true };
}

const companySchema = z.object({
  name: z.string().trim().min(1, "Enter your brand name.").max(120),
  website: z.string().trim().max(200).transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v)).pipe(z.union([z.literal(""), z.url("Enter a valid website.")])),
  hq_city: z.string().trim().max(80), hq_state: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, "Choose a state."),
});
export async function saveCompany(input: z.input<typeof companySchema>): Promise<R> {
  const { s, db } = await brand();
  if (s.org!.memberRole !== "owner") return { error: "Only owners can change the brand name and website." };
  const p = companySchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await db.from("organizations").update({ name: p.data.name, website: p.data.website || null, hq_city: p.data.hq_city || null, hq_state: p.data.hq_state || null }).eq("id", s.org!.id);
  done();
  return error ? { error: "Couldn't save." } : { ok: true };
}

const productSchema = z.object({
  id: uuid.nullable(),
  name: z.string().trim().min(1, "Name the product.").max(160),
  description: txt(1000), size: txt(60),
  case_pack: z.number().int().min(1).max(1000).nullable(),
  msrp: z.number().min(0).max(100000).nullable(), wholesale: z.number().min(0).max(100000).nullable(),
  upc: z.string().trim().regex(/^([0-9]{8,14})?$/, "UPC is 8 to 14 digits.").transform((v) => v || null).nullable(),
  shelf_life_days: z.number().int().min(1).max(3650).nullable(),
  storage: opt(["ambient", "refrigerated", "frozen"]),
});
export async function saveProduct(input: z.input<typeof productSchema>): Promise<R> {
  const { s, db } = await brand();
  const p = productSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const { id, ...row } = p.data;
  const { error } = id
    ? await db.from("brand_products").update(row).eq("id", id).eq("org_id", s.org!.id)
    : await db.from("brand_products").insert({ ...row, org_id: s.org!.id });
  done();
  return error ? { error: "Couldn't save the product." } : { ok: true };
}
export async function deleteProduct(id: string): Promise<R> {
  const { s, db } = await brand();
  const { error } = await db.from("brand_products").delete().eq("id", uuid.parse(id)).eq("org_id", s.org!.id);
  done();
  return error ? { error: "Couldn't delete." } : { ok: true };
}

export async function registerBrandFile(input: { path: string; name: string; mime: string; folder: string }): Promise<R> {
  const { s, db } = await brand();
  const p = z.object({ path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/), name: z.string().trim().min(1).max(200), mime: z.string(), folder: z.enum(DATA_ROOM_FOLDERS) }).safeParse(input);
  if (!p.success || !p.data.path.startsWith(`${s.org!.id}/`)) return { error: "Invalid upload." };
  const v = await verifyStoredUpload("brand-files", p.data.path, p.data.mime);
  if (v.error) return { error: v.error };
  const { error } = await db.from("brand_files").insert({ org_id: s.org!.id, folder: p.data.folder, file_name: p.data.name, storage_path: p.data.path, mime_type: p.data.mime, size_bytes: v.bytes!.length, created_by: s.userId });
  if (error) { await createAdminClient().storage.from("brand-files").remove([p.data.path]); return { error: "Couldn't save the file." }; }
  done();
  return { ok: true };
}
export async function deleteBrandFile(id: string): Promise<R> {
  const { s, db } = await brand();
  const { data: f } = await db.from("brand_files").delete().eq("id", uuid.parse(id)).eq("org_id", s.org!.id).select("storage_path").maybeSingle();
  if (!f) return { error: "File not found." };
  await createAdminClient().storage.from("brand-files").remove([f.storage_path]);
  done();
  return { ok: true };
}

/** A short-lived link to a data room file: the brand's team, admins, and brokers it has messaged (RLS decides). */
export async function openBrandFile(id: string): Promise<{ url?: string; error?: string }> {
  const db = await createClient();
  const { data: f } = await db.from("brand_files").select("storage_path, file_name").eq("id", uuid.parse(id)).maybeSingle();
  if (!f) return { error: "File not found." };
  const { data } = await db.storage.from("brand-files").createSignedUrl(f.storage_path, 300, { download: f.file_name });
  return data?.signedUrl ? { url: data.signedUrl } : { error: "Couldn't open the file." };
}
