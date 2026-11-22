import "server-only";
import { z } from "zod";
import { resolveNames } from "@/lib/brand-setup";
import { sendNow } from "@/lib/email/send";
import { APP_URL } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { newNonce, signWelcome, verifyWelcome } from "@/lib/welcome-token";

/**
 * Purvey sets up brand and broker accounts by hand, then emails the owner a
 * link that signs them in and verifies their email. There are no passwords.
 * Everything here runs with the service role, behind requireAdmin().
 */
type Db = ReturnType<typeof createAdminClient>;
const txt = (n: number) => z.string().trim().max(n).optional().transform((v) => v || null);
const csv = z.string().optional().transform((v) => (v ?? "").split(/[,\n]/).map((x) => x.trim().replace(/[<>]/g, "")).filter(Boolean).slice(0, 60));

export const accountSchema = z.object({
  type: z.enum(["brand", "broker"]),
  name: z.string().trim().min(1, "Enter the company name.").max(120),
  website: z.string().trim().max(200).optional().transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null)),
  hqCity: txt(80),
  hqState: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, "Use a two-letter state.").optional().transform((v) => v || null),
  ownerName: txt(120),
  ownerEmail: z.union([z.literal(""), z.email("Enter a valid owner email.")]).optional().transform((v) => (v ? v.toLowerCase() : null)),
  ownerPhone: txt(40),
  about: txt(2000),
  // Brokers
  states: csv, retailers: csv, channels: csv, distributors: csv, categories: csv,
  publish: z.string().optional().transform((v) => v === "1"),
  send: z.string().optional().transform((v) => v === "1"),
  note: txt(600),
});
export type AccountInput = z.output<typeof accountSchema>;

const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "org";
async function uniqueSlug(db: Db, name: string) {
  const base = slugify(name);
  for (let n = 1; n < 200; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const { data } = await db.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${Date.now()}`;
}

/** Find or create the owner's sign-in account. Only Purvey creates it, and only the owner's inbox gets the one-time sign-in link. */
export async function ensureUser(db: Db, email: string, name: string | null, phone: string | null, role: "brand" | "broker"): Promise<{ id: string } | { error: string }> {
  let { data: user } = await db.from("users").select("id").ilike("email", email).maybeSingle();
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: name ?? undefined, set_up_by_purvey: true } });
    if (error || !data.user) return { error: `Couldn't create the account for ${email}: ${error?.message ?? "unknown error"}` };
    user = { id: data.user.id };
  }
  await db.from("users").update({ ...(name ? { name } : {}), ...(phone ? { phone } : {}), role }).eq("id", user.id);
  return user;
}

/** Make this person the organization's owner. Refuses if they already belong to another organization. */
export async function addOwner(db: Db, orgId: string, type: "brand" | "broker", email: string, name: string | null, phone: string | null): Promise<{ userId: string } | { error: string }> {
  const u = await ensureUser(db, email, name, phone, type);
  if ("error" in u) return u;
  const { data: m } = await db.from("org_members").select("org_id").eq("user_id", u.id).maybeSingle();
  if (m && m.org_id !== orgId) return { error: `${email} already belongs to another organization on Bench.` };
  if (!m) {
    const { error } = await db.from("org_members").insert({ org_id: orgId, user_id: u.id, role: "owner" });
    if (error) return { error: `Couldn't add ${email} as owner: ${error.message}` };
  }
  return { userId: u.id };
}

/** Create a brand or brokerage the way onboarding would, filled in from the form. */
export async function createAccount(input: AccountInput, adminId: string): Promise<{ orgId: string; ownerId: string | null; notes: string[] } | { error: string }> {
  const db = createAdminClient();
  const notes: string[] = [];
  const { data: org, error } = await db.from("organizations").insert({
    type: input.type, name: input.name, slug: await uniqueSlug(db, input.name), website: input.website, hq_city: input.hqCity, hq_state: input.hqState, created_by: adminId,
  }).select("id").single();
  if (error || !org) return { error: `Couldn't create ${input.name}: ${error?.message ?? "unknown error"}` };
  const orgId = org.id as string;

  let ownerId: string | null = null;
  if (input.ownerEmail) {
    const o = await addOwner(db, orgId, input.type, input.ownerEmail, input.ownerName, input.ownerPhone);
    if ("error" in o) { await db.from("organizations").delete().eq("id", orgId); return o; }
    ownerId = o.userId;
  }

  if (input.type === "brand") {
    await db.from("brand_profiles").insert({ org_id: orgId, about: input.about });
  } else {
    const list = (t: string) => db.from(t).select("id, name").eq("active", true);
    const [ret, chan, dist, cat] = await Promise.all([list("retailers"), list("channels"), list("distributors"), list("categories")]);
    type R = { id: number; name: string };
    const C = resolveNames(input.channels, (chan.data ?? []) as R[]), D = resolveNames(input.distributors, (dist.data ?? []) as R[]), K = resolveNames(input.categories, (cat.data ?? []) as R[]);
    const { data: listing } = await db.from("broker_listings").insert({
      org_id: orgId, about: input.about,
      channels: C.ids, other_channels: C.other.slice(0, 20), distributors: D.ids, other_distributors: D.other.slice(0, 20), categories: K.ids, other_categories: K.other.slice(0, 20),
    }).select("id").single();
    const listingId = listing!.id as string;
    await db.from("broker_contacts").insert({ listing_id: listingId, name: input.ownerName, email: input.ownerEmail, phone: input.ownerPhone });
    const states = input.states.map((x) => x.toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
    if (states.length) {
      const { error: se } = await db.from("broker_states").insert(states.map((state_code) => ({ listing_id: listingId, state_code })));
      if (se) notes.push("Some states weren't recognised; check the listing's coverage.");
    }
    const R2 = (ret.data ?? []) as R[];
    const rows = input.retailers.map((n) => { const r = resolveNames([n], R2); return r.ids.length ? { listing_id: listingId, retailer_id: r.ids[0], custom_name: null, call_frequency: "weekly" } : { listing_id: listingId, retailer_id: null, custom_name: n.slice(0, 120), call_frequency: "weekly" }; });
    const seen = new Set<string>();
    const uniq = rows.filter((r) => { const k = String(r.retailer_id ?? r.custom_name).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    if (uniq.length) await db.from("broker_retailers").insert(uniq);
    // Listings are free: give access now, and go live if asked and the basics are there.
    await db.from("subscriptions").upsert({ org_id: orgId, comped: true }, { onConflict: "org_id" });
    if (input.publish) {
      const ready = uniq.length >= 3 && states.length > 0 && !!input.about && !!input.ownerName && !!input.ownerEmail;
      if (ready) {
        await db.from("broker_listings").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", listingId);
        await db.rpc("sync_listing_status", { p_org: orgId });
      } else notes.push("Not published yet: a live listing needs a description, an owner name and email, a state and at least three retailers.");
    }
    if (C.other.length + D.other.length + K.other.length) notes.push(`Kept as typed (not on Bench's lists): ${[...C.other, ...D.other, ...K.other].join(", ")}.`);
  }
  await db.from("product_events").insert({ name: "admin_account_setup", user_id: adminId, org_id: orgId, props: { type: input.type, owner: input.ownerEmail } });
  return { orgId, ownerId, notes };
}

/** Email the owner their "account is ready" link. Replaces any earlier link. */
export async function sendWelcome(orgId: string, opts: { note?: string | null; from?: string | null } = {}): Promise<{ ok: string } | { error: string }> {
  const db = createAdminClient();
  const { data: org } = await db.from("organizations").select("name, type, org_members(role, user_id, users!org_members_user_id_fkey(email, name))").eq("id", orgId).single();
  if (!org) return { error: "Organization not found." };
  const owner = ((org.org_members ?? []) as unknown as { role: string; user_id: string; users: { email: string; name: string | null } | null }[]).find((m) => m.role === "owner");
  if (!owner?.users?.email) return { error: `${org.name} has no owner yet. Add the owner's email first.` };
  const { data: au } = await db.auth.admin.getUserById(owner.user_id);
  const nonce = newNonce();
  const { error: ue } = await db.auth.admin.updateUserById(owner.user_id, { app_metadata: { ...(au.user?.app_metadata ?? {}), welcome_nonce: nonce, welcome_sent_at: new Date().toISOString() } });
  if (ue) return { error: `Couldn't prepare the link: ${ue.message}` };
  const link = `${APP_URL}/welcome/${signWelcome(owner.user_id, nonce)}`;
  const ok = await sendNow(owner.users.email, "account_ready", {
    org: org.name, org_type: org.type, name: (owner.users.name ?? "").split(" ")[0], email: owner.users.email, link, note: opts.note ?? null, from: opts.from ?? null,
  });
  if (!ok) return { error: "The email didn't send. Check the email settings and try again." };
  await db.from("product_events").insert({ name: "admin_welcome_sent", org_id: orgId, props: { to: owner.users.email } });
  return { ok: `Sign-in link sent to ${owner.users.email}. It works for 14 days.` };
}

/**
 * Redeem a welcome link: check it, retire it, and return a one-time Supabase
 * sign-in token for /auth/confirm (which signs in and verifies the email).
 */
export async function redeemWelcome(token: string): Promise<{ url: string } | { error: "invalid" | "expired" | "used" }> {
  const v = verifyWelcome(token);
  if (!v.ok) return { error: v.reason };
  const db = createAdminClient();
  const { data: au } = await db.auth.admin.getUserById(v.claims.u);
  const user = au.user;
  if (!user?.email || user.app_metadata?.welcome_nonce !== v.claims.n) return { error: "used" };
  // Same path as every Bench sign-in: a one-time token that /auth/confirm verifies into a session.
  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (error || !link.properties?.hashed_token) return { error: "invalid" };
  await db.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, welcome_nonce: null, welcome_used_at: new Date().toISOString() } });
  const { data: m } = await db.from("org_members").select("organizations(type)").eq("user_id", user.id).maybeSingle();
  const next = (m?.organizations as unknown as { type: string } | null)?.type === "broker" ? "/app/listing?welcome=1" : "/app/brand?welcome=1";
  return { url: `/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=email&next=${encodeURIComponent(next)}` };
}
