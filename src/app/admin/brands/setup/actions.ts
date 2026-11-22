"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { brandSetupSchema, resolveNames } from "@/lib/brand-setup";
import { ensureUser } from "@/lib/admin-accounts";
import { createAdminClient } from "@/lib/supabase/admin";

const go = (msg: { ok?: string; err?: string }, path = "/admin/brands/setup"): never => {
  revalidatePath("/admin/brands");
  redirect(`${path}?${new URLSearchParams(msg as Record<string, string>).toString()}`);
};
const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "brand";

/**
 * Create (or update) a client brand from a JSON spec: the owner's account
 * (no password: Bench signs in by emailed link), the organization, the full
 * profile and products. Runs again safely: the same owner email updates the
 * same brand. Sends nothing to the brand.
 */
export async function setUpBrand(f: FormData) {
  const { s } = await requireAdmin();
  let raw: unknown;
  try { raw = JSON.parse(String(f.get("spec") ?? "")); } catch { go({ err: "That isn't valid JSON." }); }
  const parsed = brandSetupSchema.safeParse(raw);
  if (!parsed.success) go({ err: `Check the spec: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` });
  const spec = parsed.data!;
  const db = createAdminClient();

  // 1. The owner's account (optional), created unverified: the emailed sign-in link verifies it.
  const orgFields = { name: spec.brand.name, website: spec.brand.website, hq_city: spec.brand.hq_city, hq_state: spec.brand.hq_state ?? null, ...(spec.brand.logo_url ? { logo_url: spec.brand.logo_url } : {}) };
  let orgId: string | undefined;
  let ownerId: string | null = null;
  if (spec.contact) {
    const u = await ensureUser(db, spec.contact.email, spec.contact.name, spec.contact.phone, "brand");
    if ("error" in u) go({ err: (u as { error: string }).error });
    ownerId = (u as { id: string }).id;
    const { data: membership } = await db.from("org_members").select("org_id, organizations(type)").eq("user_id", ownerId).maybeSingle();
    if (membership && (membership.organizations as unknown as { type: string }).type !== "brand") go({ err: `${spec.contact.email} already belongs to a brokerage.` });
    orgId = membership?.org_id as string | undefined;
  }
  // 2. The brand: the owner's, else an owner-less brand Purvey set up earlier with this exact name, else a new one.
  if (!orgId) {
    const { data: prior } = await db.from("organizations").select("id, org_members(user_id)").eq("type", "brand").eq("name", spec.brand.name).eq("created_by", s.userId).maybeSingle();
    if (prior && !((prior.org_members ?? []) as unknown[]).length) orgId = prior.id as string;
  }
  if (!orgId) {
    const base = slugify(spec.brand.name);
    let slug = base;
    for (let n = 2; ; n++) {
      const { data: taken } = await db.from("organizations").select("id").eq("slug", slug).maybeSingle();
      if (!taken) break;
      slug = `${base}-${n}`;
    }
    const { data: org, error } = await db.from("organizations").insert({ type: "brand", slug, created_by: ownerId ?? s.userId, ...orgFields }).select("id").single();
    if (error || !org) go({ err: `Couldn't create the brand: ${error?.message ?? "unknown error"}` });
    orgId = org!.id;
    await db.from("brand_profiles").insert({ org_id: orgId });
  } else {
    await db.from("organizations").update(orgFields).eq("id", orgId);
  }
  if (ownerId) {
    const { data: m } = await db.from("org_members").select("org_id").eq("user_id", ownerId).maybeSingle();
    if (!m) await db.from("org_members").insert({ org_id: orgId, user_id: ownerId, role: "owner" });
  }

  // 3. The full profile. Names are matched to Bench's lists; the rest go in "other".
  const list = (t: string) => db.from(t).select("id, name").eq("active", true);
  const [ret, dist, chan, cat] = await Promise.all([list("retailers"), list("distributors"), list("channels"), list("categories")]);
  const R = (ret.data ?? []) as { id: number; name: string }[], D = (dist.data ?? []) as typeof R, C = (chan.data ?? []) as typeof R, K = (cat.data ?? []) as typeof R;
  const p = spec.profile;
  const curR = resolveNames(p.current_retailers, R), tgtR = resolveNames(p.target_retailers, R);
  const curD = resolveNames(p.current_distributors, D), tgtD = resolveNames(p.target_distributors, D);
  const curC = resolveNames(p.current_channels, C), tgtC = resolveNames(p.target_channels, C);
  const cats = resolveNames(p.categories, K);
  const { error: pe } = await db.from("brand_profiles").update({
    about: p.about, founded_year: p.founded_year ?? null, stage: p.stage ?? null, annual_revenue_band: p.annual_revenue_band ?? null,
    current_doors: p.current_doors ?? null, current_states: p.current_states, target_states: p.target_states, target_regions: p.target_regions,
    categories: cats.ids, other_categories: cats.other.slice(0, 20),
    current_retailers: curR.ids, other_current_retailers: curR.other.slice(0, 20),
    target_retailers: tgtR.ids, other_target_retailers: tgtR.other.slice(0, 20),
    current_distributors: curD.ids, target_distributors: tgtD.ids,
    current_channels: curC.ids, other_current_channels: curC.other.slice(0, 20),
    target_channels: tgtC.ids, other_target_channels: tgtC.other.slice(0, 20),
    certifications: p.certifications, storage: p.storage ?? null, timeline: p.timeline ?? null,
    commission_pref: p.commission_pref ?? null, max_rate: p.max_rate ?? null, max_retainer: p.max_retainer ?? null,
    trade_budget_band: p.trade_budget_band ?? null, looking_for: p.looking_for, updated_at: new Date().toISOString(),
  }).eq("org_id", orgId!);
  if (pe) go({ err: `Brand created, but the profile didn't save: ${pe.message}` });

  // 4. Products, matched by name so a re-run updates instead of duplicating.
  const { data: existing } = await db.from("brand_products").select("id, name").eq("org_id", orgId!);
  const byName = new Map((existing ?? []).map((x) => [x.name.toLowerCase(), x.id as string]));
  let sort = 0;
  for (const prod of spec.products) {
    const row = { ...prod, storage: prod.storage ?? null, case_pack: prod.case_pack ?? null, msrp: prod.msrp ?? null, wholesale: prod.wholesale ?? null, shelf_life_days: prod.shelf_life_days ?? null, sort: sort++ };
    const id = byName.get(prod.name.toLowerCase());
    const { error } = id ? await db.from("brand_products").update(row).eq("id", id) : await db.from("brand_products").insert({ ...row, org_id: orgId });
    if (error) go({ err: `Profile saved, but product "${prod.name}" didn't: ${error.message}` });
  }

  await db.from("product_events").insert({ name: "admin_brand_setup", user_id: s.userId, org_id: orgId, props: { brand: spec.brand.name, owner: spec.contact?.email ?? null } });
  const unmatched = [...curD.other, ...tgtD.other];
  go({ ok: `${spec.brand.name} is set up${spec.contact ? ` with ${spec.contact.name} (${spec.contact.email}) as owner` : " with no owner yet (add one under Accounts)"}: profile and ${spec.products.length} product${spec.products.length === 1 ? "" : "s"} saved. Nothing was sent to them.${unmatched.length ? ` Distributors not on Bench's list (add them under Lists): ${unmatched.join(", ")}.` : ""}` });
}
