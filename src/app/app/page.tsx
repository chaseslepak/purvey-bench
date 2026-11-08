import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

const STATE_COPY: Record<string, { label: string; help: string }> = {
  draft: { label: "Draft", help: "Finish your listing and submit it. It goes live once your $100 monthly subscription starts." },
  submitted: { label: "Submitted", help: "Your listing is ready. Start your $100 monthly subscription to go live." },
  live: { label: "Live", help: "Brands can find and message you." },
  paused_billing: { label: "Paused for billing", help: "Your payment didn’t go through. Update your card in Billing to go live again." },
  paused_admin: { label: "Paused by Purvey", help: "Purvey has paused your listing. Reply to our email or contact us to resolve it." },
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  const { welcome } = await searchParams;
  const supabase = await createClient();

  let listing: { id: string; completeness: number; verified_at: string | null } | null = null;
  let displayState: string | null = null;
  let sub: { current_period_end: string | null; comped: boolean } | null = null;
  if (session.org.type === "broker") {
    const { data } = await supabase.from("broker_listings").select("id, completeness, verified_at").eq("org_id", session.org.id).single();
    listing = data;
    if (listing) {
      const { data: s } = await supabase.rpc("listing_display_state", { p_listing: listing.id });
      displayState = s as string | null;
    }
    const { data: subscription } = await supabase.from("subscriptions").select("current_period_end, comped").eq("org_id", session.org.id).maybeSingle();
    sub = subscription;
  }

  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">{session.org.type === "broker" ? "Brokerage" : "Brand"} · {session.org.memberRole}</div>
        <h1 className="bench-h-section">{session.org.name}</h1>
        {welcome && (
          <p className="bench-notice" role="status">
            {welcome === "broker"
              ? "Welcome to Purvey Bench. Next, build your listing. Brands see it once you go live."
              : "Welcome to Purvey Bench. Search, profiles and messaging are free for brands, always."}
          </p>
        )}
      </section>

      {session.org.type === "broker" && listing && displayState && (
        <section className="bench-grid-3">
          <div className="bench-card bench-stack">
            <div className="bench-eyebrow">Listing status</div>
            <div className="bench-row">
              <span className={`bench-tag${displayState === "live" ? " is-blue" : ""}`}>{STATE_COPY[displayState]?.label ?? displayState}</span>
              {listing.verified_at && <span className="bench-tag is-mist">Verified</span>}
            </div>
            <p className="bench-small">{STATE_COPY[displayState]?.help}</p>
          </div>
          <div className="bench-card bench-stack">
            <div className="bench-eyebrow">Profile strength</div>
            <div className="bench-h-section">{listing.completeness}%</div>
            <p className="bench-small bench-muted">At 80% or more you can ask Purvey to verify your listing.</p>
          </div>
          <div className="bench-card bench-stack">
            <div className="bench-eyebrow">Next billing date</div>
            <div className="bench-h-section" style={{ fontSize: "1.5rem" }}>
              {sub?.comped ? "Complimentary" : sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("en-US", { dateStyle: "medium" }) : "Not started"}
            </div>
          </div>
        </section>
      )}

      {session.org.type === "broker" && (
        <div className="bench-row">
          <Link href="/app/listing" className="button w-button">Edit your listing</Link>
          <Link href="/app/billing" className="button bench-btn-ghost w-button">Billing</Link>
        </div>
      )}

      <section className="bench-section bench-stack">
        <h2 className="bench-h-section">Your team</h2>
        <p className="bench-muted">Invite teammates so everyone works from the same {session.org.type === "broker" ? "listing and inbox" : "briefs, shortlist and inbox"}.</p>
        <div><Link href="/app/team" className="button is-small w-button">Manage team</Link></div>
      </section>
    </>
  );
}
