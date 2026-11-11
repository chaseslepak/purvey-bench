import zlib from "node:zlib";
import { test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * Live end-to-end tests run against a real Supabase project and Stripe TEST
 * mode. They skip unless E2E_LIVE=1 and the keys are present. Every test
 * cleans up the users, orgs, files and Stripe objects it creates.
 *   SB_URL, ANON, SRK (service role), STRIPE_SECRET_KEY (sk_test_…), STRIPE_WEBHOOK_SECRET
 */
export const live = process.env.E2E_LIVE === "1" && !!process.env.SRK && !!process.env.SB_URL;
export function skipUnlessLive() {
  test.skip(!live, "set E2E_LIVE=1 with SB_URL, ANON, SRK and Stripe test keys");
}

export const admin = () => createClient(process.env.SB_URL!, process.env.SRK!, { auth: { persistSession: false } });
export const anon = () => createClient(process.env.SB_URL!, process.env.ANON!, { auth: { persistSession: false } });
export const stripeTest = () => {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) throw new Error("live tests only run with a Stripe TEST key");
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
};

export type Made = { userIds: string[]; orgIds: string[]; customers: string[]; subs: string[] };
export const made = (): Made => ({ userIds: [], orgIds: [], customers: [], subs: [] });

/** Create a confirmed user, sign them in through the real magic-link route, and onboard. */
export async function signUpAndOnboard(page: Page, m: Made, type: "brand" | "broker", orgName: string) {
  const db = admin();
  const email = `bench-e2e-${type}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;
  const { data: u, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !u.user) throw error ?? new Error("createUser failed");
  m.userIds.push(u.user.id);
  const { data: link, error: le } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (le || !link.properties) throw le ?? new Error("generateLink failed");
  await page.goto(`/auth/confirm?next=%2Fapp%2Fonboarding&token_hash=${link.properties.hashed_token}&type=email`);
  await page.getByLabel(type === "brand" ? "Brand" : "Broker", { exact: true }).check();
  await page.fill("#name", `E2E ${type}`);
  await page.fill("#orgName", orgName);
  await page.locator("main form.bench-form button[type=submit]").click();
  await page.waitForURL(/\/app(\/brand|\/listing)?\?welcome=/);
  const { data: org } = await db.from("organizations").select("id").eq("name", orgName).single();
  m.orgIds.push(org!.id);
  return { email, userId: u.user.id, orgId: org!.id as string };
}

export async function cleanup(m: Made) {
  const db = admin();
  if (m.subs.length || m.customers.length) {
    const s = stripeTest();
    for (const id of m.subs) await s.subscriptions.cancel(id).catch(() => {});
    for (const id of m.customers) await s.customers.del(id).catch(() => {});
  }
  for (const orgId of m.orgIds) {
    // Message attachments and toolbox files live under each conversation's folder.
    const { data: convs } = await db.from("conversations").select("id").or(`brand_org_id.eq.${orgId},broker_org_id.eq.${orgId}`);
    for (const c of convs ?? []) {
      for (const bucket of ["message-files", "toolbox"]) {
        const { data: files } = await db.storage.from(bucket).list(c.id);
        if (files?.length) await db.storage.from(bucket).remove(files.map((f) => `${c.id}/${f.name}`));
      }
    }
    const { data: logos } = await db.storage.from("logos").list(orgId);
    if (logos?.length) await db.storage.from("logos").remove(logos.map((o) => `${orgId}/${o.name}`));
    const { data: l } = await db.from("broker_listings").select("id").eq("org_id", orgId).maybeSingle();
    if (l) {
      const { data: d } = await db.storage.from("listing-docs").list(l.id);
      if (d?.length) await db.storage.from("listing-docs").remove(d.map((o) => `${l.id}/${o.name}`));
    }
    await db.from("organizations").delete().eq("id", orgId);
  }
  for (const id of m.userIds) await db.auth.admin.deleteUser(id);
}

/** Post Stripe's real event for an object to our webhook, signed like Stripe does. */
export async function deliverStripeEvent(baseURL: string, type: string, objectId: string) {
  const s = stripeTest();
  for (let i = 0; i < 20; i++) {
    const evs = await s.events.list({ type, limit: 20 });
    const ev = evs.data.find((e) => (e.data.object as { id: string }).id === objectId);
    if (ev) {
      const payload = JSON.stringify(ev);
      const header = s.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
      const res = await fetch(`${baseURL}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
      return { status: res.status, body: await res.json(), payload, header };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no ${type} event for ${objectId}`);
}

export function tinyPng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.from([0, 54, 118, 177, 54, 118, 177, 0, 54, 118, 177, 54, 118, 177]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
export const pdf = (extra = "") => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog ${extra} >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);

type BrokerSpec = {
  name: string; states: string[]; retailers: [slug: string, freq: "weekly" | "monthly" | "occasional"][];
  channels: string[]; categories: string[]; conflicts?: string[]; distributors: string[]; email: string; verified?: boolean;
};

/** A live, comped broker created directly with the service role (test fixture). */
export async function makeLiveBroker(m: Made, spec: BrokerSpec) {
  const db = admin();
  const ids = async (table: string, slugs: string[]) => {
    const { data } = await db.from(table).select("id, slug").in("slug", slugs);
    return slugs.map((s) => (data ?? []).find((r) => r.slug === s)!.id as number);
  };
  const ownerEmail = `bench-e2e-fixture-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;
  const { data: u } = await db.auth.admin.createUser({ email: ownerEmail, email_confirm: true, user_metadata: { name: "Fixture Broker" } });
  m.userIds.push(u.user!.id);
  await db.from("users").update({ role: "broker" }).eq("id", u.user!.id);
  const slug = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const { data: org, error } = await db.from("organizations").insert({ type: "broker", name: spec.name, slug, hq_city: "Chicago", hq_state: "IL", created_by: u.user!.id }).select("id").single();
  if (error) throw error;
  m.orgIds.push(org!.id);
  await db.from("org_members").insert({ org_id: org!.id, user_id: u.user!.id, role: "owner" });
  const { data: l } = await db.from("broker_listings").insert({
    org_id: org!.id, about: `${spec.name} is an E2E fixture brokerage.`, channels: await ids("channels", spec.channels), categories: await ids("categories", spec.categories),
    conflicts: await ids("categories", spec.conflicts ?? []), distributors: await ids("distributors", spec.distributors), status: "submitted",
    verified_at: spec.verified ? new Date().toISOString() : null,
  }).select("id").single();
  await db.from("broker_contacts").insert({ listing_id: l!.id, name: "Fixture Contact", title: "Principal", email: spec.email, phone: "312-555-0199" });
  await db.from("broker_states").insert(spec.states.map((s) => ({ listing_id: l!.id, state_code: s })));
  const rids = await ids("retailers", spec.retailers.map((r) => r[0]));
  await db.from("broker_retailers").insert(spec.retailers.map((r, i) => ({ listing_id: l!.id, retailer_id: rids[i], call_frequency: r[1] })));
  await db.from("subscriptions").insert({ org_id: org!.id, comped: true });
  const { data: st } = await db.rpc("sync_listing_status", { p_org: org!.id });
  if (st !== "live") throw new Error(`fixture not live: ${st}`);
  await db.from("users").update({ name: "Xavier Fixture" }).eq("id", u.user!.id);
  return { orgId: org!.id as string, listingId: l!.id as string, slug, ownerEmail, ownerId: u.user!.id };
}

/** Sign an existing user in through the real magic-link route. */
export async function signIn(page: Page, email: string, next = "/app") {
  const { data: link, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link.properties) throw error ?? new Error("generateLink failed");
  await page.goto(`/auth/confirm?next=${encodeURIComponent(next)}&token_hash=${link.properties.hashed_token}&type=email`);
}
