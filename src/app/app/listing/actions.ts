"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLANS, type Plan, stripe, stripeConfigured, listingPriceId } from "@/lib/billing/stripe";
import { earlyAccessLeft } from "@/lib/billing/early-access";
import { hasListingAccess } from "@/lib/billing/subscription";
import { syncSubscription } from "@/lib/billing/sync";
import { requestOrigin } from "@/lib/origin";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkPdf, DOC_MAX, LOGO_MAX, sniffImage } from "@/lib/uploads";

export type ChecklistItem = { key: string; label: string; step: number; done: boolean };
export type SaveResult = { ok: true; checklist: ChecklistItem[]; completeness: number } | { ok: false; error: string; field?: string };

const optText = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const optInt = (min: number, max: number) =>
  z.union([z.literal(""), z.coerce.number().int().min(min).max(max)]).transform((v) => (v === "" ? null : v));
const optNum = (min: number, max: number) =>
  z.union([z.literal(""), z.coerce.number().min(min).max(max)]).transform((v) => (v === "" ? null : v));
const optEmail = z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email address.")]).transform((v) => v || null);
const optUrl = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .pipe(z.union([z.literal(""), z.url("Enter a valid website.")]))
  .transform((v) => v || null);
const ids = z.array(z.number().int().positive()).max(200);
const names = z.array(z.string().trim().min(1).max(80).regex(/^[^<>]+$/)).max(20).default([]);

const steps = {
  company: z.object({
    name: z.string().trim().min(1, "Enter your brokerage name.").max(120),
    website: optUrl,
    hqCity: optText(80),
    hqState: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/).transform((v) => v || null),
    about: z.string().trim().max(500, "Keep it to 500 characters.").transform((v) => v || null),
    contactName: optText(120),
    contactTitle: optText(120),
    contactEmail: optEmail,
    contactPhone: optText(40),
  }),
  coverage: z.object({
    states: z.array(z.string().regex(/^[A-Z]{2}$/)).max(51),
    channels: ids,
    distributors: ids,
    otherChannels: names,
    otherDistributors: names,
  }),
  retailers: z.object({
    rows: z
      .array(
        z.union([
          z.object({ retailerId: z.number().int().positive(), customName: z.null().optional(), freq: z.enum(["weekly", "monthly", "occasional"]) }),
          z.object({ retailerId: z.null().optional(), customName: z.string().trim().min(1).max(120), freq: z.enum(["weekly", "monthly", "occasional"]) }),
        ]),
      )
      .max(300),
  }),
  categories: z.object({ categories: ids, conflicts: ids, otherCategories: names, otherConflicts: names, currentLines: z.string().trim().max(2000).transform((v) => v || null) }),
  terms: z
    .object({
      model: z.union([z.literal(""), z.enum(["pct_net_sales", "retainer_plus_pct", "retainer_only"])]).transform((v) => v || null),
      rateLow: optNum(0, 100),
      rateHigh: optNum(0, 100),
      retainer: optNum(0, 1_000_000),
      minTerm: optInt(0, 120),
    })
    .refine((t) => t.rateLow == null || t.rateHigh == null || t.rateLow <= t.rateHigh, { message: "The low rate can't be above the high rate.", path: ["rateHigh"] }),
  proof: z.object({
    years: optInt(0, 200),
    teamSize: optInt(0, 100000),
    merchandisers: optInt(0, 100000),
    references: z
      .array(z.object({ name: optText(120), brand: optText(120), email: optEmail, phone: optText(40) }))
      .max(5),
  }),
} as const;

export type StepName = keyof typeof steps;

async function context() {
  const session = await getSession();
  if (!session?.org || session.org.type !== "broker") throw new Error("Only brokerages have a listing.");
  const db = await createClient();
  const { data: listing } = await db.from("broker_listings").select("id, org_id").eq("org_id", session.org.id).single();
  if (!listing) throw new Error("Listing not found.");
  return { session, db, listing };
}

async function checklist(db: Awaited<ReturnType<typeof createClient>>): Promise<{ checklist: ChecklistItem[]; completeness: number }> {
  const { data } = await db.rpc("my_listing_checklist");
  const items = (data ?? []) as ChecklistItem[];
  return { checklist: items, completeness: items.length ? Math.round((100 * items.filter((i) => i.done).length) / items.length) : 0 };
}

/** Autosave one builder step. */
export async function saveStep(step: StepName, payload: unknown): Promise<SaveResult> {
  const schema = steps[step];
  if (!schema) return { ok: false, error: "Unknown step." };
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: String(i.path[0] ?? "") };
  }
  const { db, listing } = await context();
  const fail = (e: { message: string } | null) => (e ? { ok: false as const, error: friendly(e.message) } : null);

  switch (step) {
    case "company": {
      const c = parsed.data as z.infer<typeof steps.company>;
      const e1 = (await db.from("organizations").update({ name: c.name, website: c.website, hq_city: c.hqCity, hq_state: c.hqState }).eq("id", listing.org_id)).error;
      if (e1) return fail(e1)!;
      const e2 = (await db.from("broker_listings").update({ about: c.about }).eq("id", listing.id)).error;
      if (e2) return fail(e2)!;
      const e3 = (await db.from("broker_contacts").upsert({ listing_id: listing.id, name: c.contactName, title: c.contactTitle, email: c.contactEmail, phone: c.contactPhone })).error;
      if (e3) return fail(e3)!;
      break;
    }
    case "coverage": {
      const c = parsed.data as z.infer<typeof steps.coverage>;
      const e1 = (await db.rpc("save_listing_states", { p_listing: listing.id, p_states: c.states })).error;
      if (e1) return fail(e1)!;
      const e2 = (await db.from("broker_listings").update({ channels: c.channels, distributors: c.distributors, other_channels: c.otherChannels, other_distributors: c.otherDistributors }).eq("id", listing.id)).error;
      if (e2) return fail(e2)!;
      break;
    }
    case "retailers": {
      const c = parsed.data as z.infer<typeof steps.retailers>;
      const rows = c.rows.map((r) => ({ retailer_id: r.retailerId ?? null, custom_name: r.retailerId ? null : r.customName, call_frequency: r.freq }));
      const e = (await db.rpc("save_listing_retailers", { p_listing: listing.id, p_rows: rows })).error;
      if (e) return fail(e)!;
      break;
    }
    case "categories": {
      const c = parsed.data as z.infer<typeof steps.categories>;
      const e = (await db.from("broker_listings").update({ categories: c.categories, conflicts: c.conflicts, other_categories: c.otherCategories, other_conflicts: c.otherConflicts, current_lines: c.currentLines }).eq("id", listing.id)).error;
      if (e) return fail(e)!;
      break;
    }
    case "terms": {
      const t = parsed.data as z.infer<typeof steps.terms>;
      const e = (await db.from("broker_listings").update({
        commission_model: t.model,
        rate_low: t.model === "retainer_only" ? null : t.rateLow,
        rate_high: t.model === "retainer_only" ? null : t.rateHigh,
        retainer: t.model === "pct_net_sales" ? null : t.retainer,
        min_term_months: t.minTerm,
      }).eq("id", listing.id)).error;
      if (e) return fail(e)!;
      break;
    }
    case "proof": {
      const p = parsed.data as z.infer<typeof steps.proof>;
      const e1 = (await db.from("broker_listings").update({ years_in_business: p.years, team_size: p.teamSize, merchandisers: p.merchandisers }).eq("id", listing.id)).error;
      if (e1) return fail(e1)!;
      const e2 = (await db.rpc("save_listing_references", { p_listing: listing.id, p_rows: p.references })).error;
      if (e2) return fail(e2)!;
      break;
    }
  }
  return { ok: true, ...(await checklist(db)) };
}

function friendly(msg: string) {
  if (/unknown state/.test(msg)) return "One of the states isn't recognised.";
  if (/duplicate key/.test(msg)) return "That retailer is already on your list.";
  if (/check constraint/.test(msg)) return "One of the values is out of range.";
  return "Couldn't save. Please try again.";
}

/** After the browser uploads a logo to Storage, validate it and attach it. */
export async function attachLogo(path: string): Promise<SaveResult & { logoUrl?: string }> {
  const { db, listing } = await context();
  if (!new RegExp(`^${listing.org_id}/logo-[0-9]+\\.(png|jpg|webp)$`).test(path)) return { ok: false, error: "Invalid upload." };
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from("logos").download(path);
  if (error || !blob) return { ok: false, error: "Upload not found. Try again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length > LOGO_MAX || !sniffImage(bytes)) {
    await admin.storage.from("logos").remove([path]);
    return { ok: false, error: "Use a PNG, JPG or WebP image under 2 MB." };
  }
  const logoUrl = admin.storage.from("logos").getPublicUrl(path).data.publicUrl;
  const e = (await db.from("organizations").update({ logo_url: logoUrl }).eq("id", listing.org_id)).error;
  if (e) return { ok: false, error: "Couldn't save the logo." };
  // Remove older logos for this org.
  const { data: old } = await admin.storage.from("logos").list(listing.org_id);
  const stale = (old ?? []).map((o) => `${listing.org_id}/${o.name}`).filter((p) => p !== path);
  if (stale.length) await admin.storage.from("logos").remove(stale);
  revalidatePath("/app/listing");
  return { ok: true, logoUrl, ...(await checklist(db)) };
}

export type DocRow = { id: string; file_name: string; size_bytes: number; is_private: boolean; created_at: string };

/** After the browser uploads a PDF to Storage, validate it and record it. */
export async function attachDocument(path: string, fileName: string, isPrivate: boolean): Promise<SaveResult & { doc?: DocRow }> {
  const { db, listing, session } = await context();
  if (!new RegExp(`^${listing.id}/[0-9a-f-]{36}\\.pdf$`).test(path)) return { ok: false, error: "Invalid upload." };
  const name = z.string().trim().min(1).max(200).safeParse(fileName.replace(/[^\w .()&,-]/g, "_"));
  if (!name.success) return { ok: false, error: "Invalid file name." };
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from("listing-docs").download(path);
  if (error || !blob) return { ok: false, error: "Upload not found. Try again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const check = bytes.length > DOC_MAX ? { ok: false as const, reason: "PDFs must be 10 MB or smaller." } : checkPdf(bytes);
  if (!check.ok) {
    await admin.storage.from("listing-docs").remove([path]);
    return { ok: false, error: check.reason };
  }
  const { data: doc, error: e } = await db
    .from("listing_documents")
    .insert({ listing_id: listing.id, storage_path: path, file_name: name.data, mime_type: "application/pdf", size_bytes: bytes.length, is_private: isPrivate, created_by: session.userId })
    .select("id, file_name, size_bytes, is_private, created_at")
    .single();
  if (e || !doc) {
    await admin.storage.from("listing-docs").remove([path]);
    return { ok: false, error: "Couldn't save the document." };
  }
  return { ok: true, doc, ...(await checklist(db)) };
}

export async function setDocumentPrivacy(id: string, isPrivate: boolean): Promise<SaveResult> {
  const { db } = await context();
  const e = (await db.from("listing_documents").update({ is_private: isPrivate }).eq("id", z.uuid().parse(id))).error;
  if (e) return { ok: false, error: "Couldn't update the document." };
  return { ok: true, ...(await checklist(db)) };
}

export async function deleteDocument(id: string): Promise<SaveResult> {
  const { db, listing } = await context();
  // Delete only this brokerage's own row, and remove only the file that row pointed to.
  const { data: gone, error: e } = await db.from("listing_documents").delete().eq("id", z.uuid().parse(id)).eq("listing_id", listing.id).select("storage_path");
  if (e) return { ok: false, error: "Couldn't delete the document." };
  if (!gone?.length) return { ok: false, error: "Document not found." };
  await createAdminClient().storage.from("listing-docs").remove(gone.map((d) => d.storage_path as string));
  return { ok: true, ...(await checklist(db)) };
}

/** Signed, short-lived link to a document the caller may read (RLS decides). */
export async function documentLink(id: string): Promise<string | null> {
  const db = await createClient();
  const { data: doc } = await db.from("listing_documents").select("storage_path").eq("id", z.uuid().parse(id)).maybeSingle();
  if (!doc) return null;
  const { data } = await db.storage.from("listing-docs").createSignedUrl(doc.storage_path, 300);
  return data?.signedUrl ?? null;
}

export async function requestVerification(): Promise<{ ok: boolean; error?: string }> {
  const db = await createClient();
  const { error } = await db.rpc("request_verification");
  if (error) {
    return { ok: false, error: /80%/.test(error.message) ? "Reach 80% profile strength first." : /owners/.test(error.message) ? "Only owners can request verification." : /already/.test(error.message) ? "You already have a request or badge." : "Couldn't send the request." };
  }
  revalidatePath("/app/listing");
  return { ok: true };
}

/** Publish the listing. Brokers pay before building, so this goes straight live. */
export async function publishListing(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, db, listing } = await context();
  if (session.org!.memberRole !== "owner") return { ok: false, error: "Only an owner can publish the listing." };
  const { data: sub } = await db.from("subscriptions").select("status, comped, current_period_end").eq("org_id", listing.org_id).maybeSingle();
  if (!hasListingAccess(sub)) return { ok: false, error: "Choose a plan first." };
  const { error } = await db.rpc("submit_listing");
  if (error) return { ok: false, error: error.message.replace(/^.*?: /, "") };
  revalidatePath("/app/listing");
  return { ok: true };
}

/**
 * Open Stripe Checkout for the chosen plan. Brokers pay before they can build
 * their listing. The client navigates the TOP window to the returned URL so
 * Checkout never loads inside the purveycpg.com iframe.
 */
export async function startCheckout(plan: Plan): Promise<{ ok: true; checkoutUrl?: string } | { ok: false; error: string }> {
  if (!(plan in PLANS)) return { ok: false, error: "Choose a plan." };
  const session = await getSession();
  if (!session?.org || session.org.type !== "broker") return { ok: false, error: "Only brokerages subscribe." };
  if (session.org.memberRole !== "owner") return { ok: false, error: "Only an owner can start billing." };
  const orgId = session.org.id;
  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions").select("status, comped, current_period_end, stripe_customer_id").eq("org_id", orgId).maybeSingle();
  if (hasListingAccess(sub)) return { ok: true };
  if (!stripeConfigured()) return { ok: false, error: "Billing isn't configured in this environment yet." };

  try {
    // One Stripe customer per brokerage. The idempotency key makes two
    // simultaneous clicks (two tabs, two owners) get the same customer.
    let customer = sub?.stripe_customer_id ?? null;
    if (!customer) {
      const c = await stripe().customers.create(
        { name: session.org.name, email: session.email, metadata: { org_id: orgId, app: "purvey-bench" } },
        { idempotencyKey: `bench-customer-${orgId}` },
      );
      customer = c.id;
      const { error } = await admin.from("subscriptions").upsert({ org_id: orgId, stripe_customer_id: customer }, { onConflict: "org_id" });
      if (error) return { ok: false, error: "Couldn't start checkout. Please try again." };
    }

    // Already paying (e.g. paid in another tab and the webhook hasn't landed): sync, don't charge twice.
    const existing = await stripe().subscriptions.list({ customer, status: "all", limit: 10 });
    const live = existing.data.find((x) => ["active", "trialing", "past_due"].includes(x.status));
    if (live) {
      await syncSubscription(live);
      revalidatePath("/app/listing");
      return { ok: true };
    }
    // Close any checkout this brokerage left open, so an old tab can't be paid as well.
    const open = await stripe().checkout.sessions.list({ customer, status: "open", limit: 10 });
    await Promise.all(open.data.map((cs) => stripe().checkout.sessions.expire(cs.id).catch(() => null)));

    // Early access: spots are held by paid annual plans and by annual checkouts still open.
    if (plan === "annual" && (await earlyAccessLeft()) <= 0) {
      return { ok: false, error: "The early access annual deals are all taken. The monthly plan is still available." };
    }

    const origin = await requestOrigin();
    const checkout = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: orgId,
      line_items: [{ price: await listingPriceId(plan), quantity: 1 }],
      subscription_data: { metadata: { org_id: orgId, plan } },
      metadata: { org_id: orgId, plan },
      allow_promotion_codes: false,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60, // Stripe's minimum is 30 minutes
      success_url: `${origin}/app/listing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app/listing?checkout=cancelled`,
    });
    return { ok: true, checkoutUrl: checkout.url! };
  } catch (e) {
    console.error("startCheckout failed", e);
    return { ok: false, error: "Couldn't open checkout. Please try again in a minute." };
  }
}
