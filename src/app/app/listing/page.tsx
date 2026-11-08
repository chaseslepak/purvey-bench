import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ListingBuilder, type BuilderInitial } from "./ListingBuilder";
import type { ChecklistItem } from "./actions";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";
import { syncSubscription } from "@/lib/billing/sync";
import type { Freq } from "@/lib/coverage";
import { getReference } from "@/lib/reference";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your listing", robots: { index: false } };

const s = (v: unknown) => (v == null ? "" : String(v));

export default async function ListingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; session_id?: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  if (session.org.type !== "broker") redirect("/app");
  const { checkout, session_id } = await searchParams;

  // Returning from Stripe Checkout: confirm the session belongs to this org and
  // sync right away, so the listing goes live even before the webhook lands.
  let banner: string | null = null;
  if (checkout === "success" && session_id && stripeConfigured()) {
    try {
      const cs = await stripe().checkout.sessions.retrieve(session_id);
      if (cs.client_reference_id === session.org.id && cs.status === "complete" && cs.subscription) {
        await syncSubscription(typeof cs.subscription === "string" ? cs.subscription : cs.subscription.id);
        banner = "Payment received. Your listing is live.";
      }
    } catch {
      banner = "Payment received. Your listing will go live within a minute.";
    }
  } else if (checkout === "cancelled") {
    banner = "Checkout was cancelled. Your listing is saved; you can go live any time.";
  }

  const db = await createClient();
  const { data: listing } = await db.from("broker_listings").select("*").eq("org_id", session.org.id).single();
  if (!listing) redirect("/app");
  const [org, contact, states, retailers, references, documents, checklist, display, verification, ref] = await Promise.all([
    db.from("organizations").select("name, website, hq_city, hq_state, logo_url").eq("id", session.org.id).single(),
    db.from("broker_contacts").select("*").eq("listing_id", listing.id).maybeSingle(),
    db.from("broker_states").select("state_code").eq("listing_id", listing.id),
    db.from("broker_retailers").select("retailer_id, custom_name, call_frequency, retailers(name)").eq("listing_id", listing.id).order("created_at"),
    db.from("broker_references").select("name, brand, email, phone").eq("listing_id", listing.id).order("created_at"),
    db.from("listing_documents").select("id, file_name, size_bytes, is_private, created_at").eq("listing_id", listing.id).order("created_at"),
    db.rpc("my_listing_checklist"),
    db.rpc("listing_display_state", { p_listing: listing.id }),
    db.from("verifications").select("status, reason").eq("listing_id", listing.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    getReference(),
  ]);

  const initial: BuilderInitial = {
    listingId: listing.id,
    orgId: session.org.id,
    isOwner: session.org.memberRole === "owner",
    displayState: (display.data as string) ?? "draft",
    verified: Boolean(listing.verified_at),
    verification: verification.data ?? null,
    checklist: (checklist.data ?? []) as ChecklistItem[],
    company: {
      name: s(org.data?.name), website: s(org.data?.website), hqCity: s(org.data?.hq_city), hqState: s(org.data?.hq_state),
      about: s(listing.about), logoUrl: org.data?.logo_url ?? null,
      contactName: s(contact.data?.name), contactTitle: s(contact.data?.title), contactEmail: s(contact.data?.email), contactPhone: s(contact.data?.phone),
    },
    coverage: { states: (states.data ?? []).map((r) => r.state_code as string), channels: listing.channels, distributors: listing.distributors },
    retailers: (retailers.data ?? []).map((r) => ({
      retailerId: r.retailer_id, customName: r.custom_name,
      name: r.custom_name ?? (r.retailers as unknown as { name: string } | null)?.name ?? "Retailer",
      freq: r.call_frequency as Freq,
    })),
    categories: { categories: listing.categories, conflicts: listing.conflicts, currentLines: s(listing.current_lines) },
    terms: { model: s(listing.commission_model), rateLow: s(listing.rate_low), rateHigh: s(listing.rate_high), retainer: s(listing.retainer), minTerm: s(listing.min_term_months) },
    proof: {
      years: s(listing.years_in_business), teamSize: s(listing.team_size), merchandisers: s(listing.merchandisers),
      references: (references.data ?? []).map((r) => ({ name: s(r.name), brand: s(r.brand), email: s(r.email), phone: s(r.phone) })),
    },
    documents: documents.data ?? [],
    notTakingNewLines: listing.not_taking_new_lines,
  };
  return <ListingBuilder initial={initial} refs={ref} banner={banner} />;
}
