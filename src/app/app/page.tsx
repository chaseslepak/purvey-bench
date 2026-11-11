import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadBrand } from "@/lib/brand-data";
import { brandChecklist, completeness } from "@/lib/brand-profile";
import { hasListingAccess } from "@/lib/billing/subscription";
import { loadThreads } from "@/lib/inbox/load";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

const STATE_COPY: Record<string, { label: string; help: string }> = {
  draft: { label: "Draft", help: "Finish your listing and publish it." },
  submitted: { label: "Submitted", help: "Your listing is ready. Publish it to go live." },
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
  let sub: { current_period_end: string | null; comped: boolean; status: string | null; plan: string | null } | null = null;
  if (session.org.type === "broker") {
    const { data } = await supabase.from("broker_listings").select("id, completeness, verified_at").eq("org_id", session.org.id).single();
    listing = data;
    if (listing) {
      const { data: s } = await supabase.rpc("listing_display_state", { p_listing: listing.id });
      displayState = s as string | null;
    }
    const { data: subscription } = await supabase.from("subscriptions").select("current_period_end, comped, status, plan").eq("org_id", session.org.id).maybeSingle();
    sub = subscription;
  }

  let brandStrength: { pct: number; next: string | null } | null = null;
  if (session.org.type === "brand") {
    const b = await loadBrand(supabase, session.org.id);
    if (b) {
      const items = brandChecklist(b.profile, { products: b.products.length, files: b.files.length, website: !!b.org.website });
      brandStrength = { pct: completeness(items), next: items.find((i) => !i.done)?.label.toLowerCase() ?? null };
    }
  }

  const threads = await loadThreads(session.org.id, { tab: "all" });
  const unread = threads.filter((t) => t.unread && !t.archived).length;
  const awaiting = threads.filter((t) => !t.archived && !t.declined && !t.lastFromMe).length;

  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">{session.org.type === "broker" ? "Brokerage" : "Brand"} · {session.org.memberRole === "owner" ? "Owner" : "Member"}</div>
        <h1 className="bench-h-section">{session.org.name}</h1>
        {welcome && (
          <p className="bench-notice" role="status">
            {welcome === "broker"
              ? "Welcome to Purvey Bench. Next, choose a plan and build your listing. Brands see it once you publish."
              : "Welcome to Purvey Bench. Search, profiles and messaging are free for brands, always."}
          </p>
        )}
      </section>

      {session.org.type === "broker" && !hasListingAccess(sub) && session.org.memberRole === "owner" && displayState !== "paused_billing" && (
        <section className="bench-section bench-stack" aria-labelledby="plan-cta">
          <h2 id="plan-cta" className="bench-h-section">Choose a plan to start your listing</h2>
          <p className="bench-muted" style={{ margin: 0 }}>$100 a month, or $900 for the year (25% off) while early access deals last. You build your listing right after checkout.</p>
          <div><Link href="/app/listing" className="button w-button">Choose a plan</Link></div>
        </section>
      )}

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
            <div className="bench-eyebrow">{sub?.plan === "annual" ? "Annual plan renews" : sub?.plan === "monthly" ? "Monthly plan renews" : "Next billing date"}</div>
            <div className="bench-h-section" style={{ fontSize: "1.5rem" }}>
              {sub?.comped ? "Complimentary" : sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("en-US", { dateStyle: "medium" }) : "Not started"}
            </div>
          </div>
        </section>
      )}

      {session.org.type === "broker" && (
        <div className="bench-row">
          <Link href="/app/listing" className="button w-button">{hasListingAccess(sub) ? "Edit your listing" : "Choose a plan"}</Link>
          <Link href="/app/billing" className="button bench-btn-ghost w-button">Billing</Link>
        </div>
      )}

      {brandStrength && (
        <section className="bench-grid-3">
          <div className="bench-card bench-stack">
            <div className="bench-eyebrow">Brand profile</div>
            <div className="bench-h-section">{brandStrength.pct}%</div>
            <div className="bench-progress" role="progressbar" aria-label="Brand profile strength" aria-valuemin={0} aria-valuemax={100} aria-valuenow={brandStrength.pct} style={{ marginTop: 0 }}><span style={{ width: `${brandStrength.pct}%` }} /></div>
            <p className="bench-small bench-muted" style={{ margin: 0 }}>{brandStrength.next ? `Next: ${brandStrength.next}.` : "Complete. Brokers you message see all of it."}</p>
            <div><Link href="/app/brand" className="button is-small w-button">{brandStrength.pct < 100 ? "Finish your profile" : "Edit your profile"}</Link></div>
          </div>
          <div className="bench-card bench-stack">
            <div className="bench-eyebrow">Find brokers</div>
            <p className="bench-small" style={{ margin: 0 }}>Search is ranked by fit to your profile&rsquo;s goals, or to a brief.</p>
            <div><Link href="/find" className="button is-small bench-btn-ghost w-button">Search brokers</Link></div>
          </div>
          <div className="bench-card bench-stack">
            <div className="bench-eyebrow">Data room</div>
            <p className="bench-small" style={{ margin: 0 }}>Sell sheets, decks and photos brokers can open once you message them.</p>
            <div><Link href="/app/brand?step=dataroom" className="button is-small bench-btn-ghost w-button">Open data room</Link></div>
          </div>
        </section>
      )}

      <section className="bench-grid-2">
        <div className="bench-card bench-stack">
          <div className="bench-eyebrow">Inbox</div>
          {threads.length ? (
            <>
              <div className="bench-h-section">{unread} unread</div>
              <p className="bench-small bench-muted" style={{ margin: 0 }}>{awaiting ? `${awaiting} conversation${awaiting === 1 ? "" : "s"} waiting on your reply.` : "You're caught up."} {threads.length} in total.</p>
            </>
          ) : (
            <p className="bench-small" style={{ margin: 0 }}>{session.org.type === "broker" ? "Brands start conversations with you once your listing is live." : "Message a broker from their profile to start a conversation."}</p>
          )}
          <div><Link href={unread ? "/app/inbox?tab=unread" : "/app/inbox"} className="button is-small w-button">Open inbox</Link></div>
        </div>
        <div className="bench-card bench-stack">
          <div className="bench-eyebrow">Your team</div>
          <p className="bench-small" style={{ margin: 0 }}>Invite teammates so everyone works from the same {session.org.type === "broker" ? "listing and inbox" : "briefs, shortlist and inbox"}. Conversations can be assigned to anyone.</p>
          <div><Link href="/app/team" className="button is-small bench-btn-ghost w-button">Manage team</Link></div>
        </div>
      </section>
    </>
  );
}
