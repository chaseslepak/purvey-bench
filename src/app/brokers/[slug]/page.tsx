import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ContactBlock } from "@/components/brand/ContactBlock";
import { SaveButton } from "@/components/brand/SaveButton";
import { CoverageMap } from "@/components/listing/CoverageMap";
import { DocLink } from "@/components/listing/DocLink";
import { ReviewForm, type MyReview } from "@/components/reviews/ReviewForm";
import { ReviewList, type PublicReview } from "@/components/reviews/ReviewList";
import { RatingSummary } from "@/components/reviews/Stars";
import { coverageSummary, FREQ_LABEL, type Freq } from "@/lib/coverage";
import { getReference } from "@/lib/reference";
import { loadListingBySlug } from "@/lib/search-data";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const load = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return loadListingBySlug(slug);
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const l = await load((await params).slug);
  if (!l) return { title: "Broker not found", robots: { index: false } };
  return {
    title: `${l.name}, food and beverage broker${l.hq ? ` in ${l.hq}` : ""}`,
    description: l.about ?? `${l.name} on Purvey Bench: retailers, coverage and terms.`,
    alternates: { canonical: `/brokers/${l.slug}` },
  };
}

const MODEL: Record<string, string> = { pct_net_sales: "% of net sales", retainer_plus_pct: "Retainer + % of net sales", retainer_only: "Retainer only" };

export default async function BrokerProfile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [l, session, ref] = await Promise.all([load(slug), getSession(), getReference()]);
  if (!l) notFound();
  const db = await createClient();
  const [{ data: terms }, { data: docs }, saved, display] = await Promise.all([
    db.from("broker_listings").select("commission_model, rate_low, rate_high, retainer, min_term_months, years_in_business, team_size, merchandisers, current_lines, status, admin_paused").eq("id", l.id).single(),
    db.from("listing_documents").select("id, file_name").eq("listing_id", l.id).eq("is_private", false).order("created_at"),
    session?.org?.type === "brand" ? db.from("saved_brokers").select("id").eq("listing_id", l.id).maybeSingle() : Promise.resolve({ data: null }),
    session?.org?.id === l.orgId ? db.rpc("listing_display_state", { p_listing: l.id }) : Promise.resolve({ data: "live" }),
  ]);
  const own = session?.org?.id === l.orgId;
  const isBrand = session?.org?.type === "brand";
  const [{ data: rv }, mine, canReview, myRef] = await Promise.all([
    db.rpc("listing_reviews", { p_listing: l.id }),
    isBrand ? db.from("broker_reviews").select("rating, title, body, show_brand_name").eq("listing_id", l.id).eq("brand_org_id", session!.org!.id).maybeSingle() : Promise.resolve({ data: null }),
    isBrand ? db.rpc("can_review", { p_listing: l.id }) : Promise.resolve({ data: false }),
    isBrand ? db.from("brand_references").select("id").eq("listing_id", l.id).eq("brand_org_id", session!.org!.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const reviews = (rv ?? []) as PublicReview[];
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null;
  const myReview: MyReview = mine.data ? { rating: mine.data.rating, title: mine.data.title, body: mine.data.body, showName: mine.data.show_brand_name } : null;
  if (!own) await db.rpc("log_profile_events", { p_listings: [l.id], p_type: "profile_view" });

  const viewer = !session ? "anon" : session.org?.type === "brand" ? "brand" : "broker";
  const names = Object.fromEntries(ref.states.map((s) => [s.code, s.name]));
  const nameOf = (list: { id: number; name: string }[], ids: number[]) => ids.map((i) => list.find((x) => x.id === i)?.name).filter(Boolean) as string[];
  const groups = (["weekly", "monthly", "occasional"] as Freq[]).map((f) => ({ f, rows: l.retailers.filter((r) => r.freq === f).map((r) => r.name).sort() })).filter((g) => g.rows.length);
  const rate = terms?.rate_low != null ? (terms.rate_high != null && terms.rate_high !== terms.rate_low ? `${terms.rate_low}–${terms.rate_high}%` : `${terms.rate_low}%`) : null;

  return (
    <>
      {own && display.data !== "live" && (
        <p className="bench-notice is-warn" role="status" style={{ margin: 0 }}>Brands can&rsquo;t see this page yet. <Link className="bench-link" href="/app/listing">Finish and go live</Link>.</p>
      )}
      <section className="bench-section is-cream bench-stack">
        <div className="bench-profile_head">
          <div className="bench-lcard_logo" style={{ width: 88, height: 88, borderRadius: 18, background: "var(--pv-white)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo */}
            {l.logoUrl ? <img src={l.logoUrl} alt={`${l.name} logo`} /> : <span aria-hidden="true">{l.name.slice(0, 1)}</span>}
          </div>
          <div className="bench-stack" style={{ gap: 8, minWidth: 0 }}>
            <div className="text_title">Food and beverage broker</div>
            <h1 className="bench-h-section" style={{ margin: 0 }}>{l.name}</h1>
            <p className="bench-muted" style={{ margin: 0 }}>{[l.hq, coverageSummary(l.states, ref.states, ref.regions)].filter(Boolean).join(" · ")}</p>
            {avg != null && <a href="#reviews" className="bench-rating-link"><RatingSummary average={Math.round(avg * 10) / 10} count={reviews.length} /></a>}
            <div className="bench-row" style={{ gap: 6 }}>
              {l.verified && <span className="bench-tag is-blue">Verified by Purvey</span>}
              {l.notTakingNewLines && <span className="bench-tag">Not taking new lines</span>}
              {nameOf(ref.channels, l.channels).map((c) => <span key={c} className="bench-tag is-mist">{c}</span>)}
            </div>
          </div>
          <div className="bench-row" style={{ alignSelf: "start" }}>
            <SaveButton listingId={l.id} name={l.name} initial={!!saved.data} signedIn={!!session} isBrand={viewer === "brand"} next={`/brokers/${l.slug}`} />
          </div>
        </div>
        {l.notTakingNewLines && <p className="bench-notice" style={{ margin: 0 }}>{l.name} is listed but not taking on new lines right now.</p>}
        {l.about && <p className="bench-lede" style={{ margin: 0, maxWidth: "48rem" }}>{l.about}</p>}
      </section>

      <div className="bench-builder_grid">
        <div className="bench-stack">
          <section className="bench-section bench-stack" aria-labelledby="ret-h">
            <h2 id="ret-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>Retailers</h2>
            {groups.length ? (
              <div className="bench-grid-3">
                {groups.map((g) => (
                  <div key={g.f} className="bench-card bench-stack" style={{ gap: 8 }}>
                    <h3 className="bench-eyebrow" style={{ margin: 0 }}>Calls {FREQ_LABEL[g.f].toLowerCase()}</h3>
                    <ul className="bench-plainlist">{g.rows.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                ))}
              </div>
            ) : <p className="bench-muted">No retailers listed.</p>}
          </section>
          <section className="bench-section bench-stack" aria-labelledby="cov-h">
            <h2 id="cov-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>Coverage</h2>
            <CoverageMap states={l.states} names={names} />
          </section>
          <section className="bench-section" aria-labelledby="det-h">
            <h2 id="det-h" className="bench-h-section" style={{ fontSize: "1.75rem", marginBottom: 16 }}>Details</h2>
            <dl className="bench-dl">
              <dt>Categories</dt><dd>{nameOf(ref.categories, l.categories).join(", ") || "—"}</dd>
              {l.conflicts.length > 0 && (<><dt>Can&rsquo;t take on</dt><dd>{nameOf(ref.categories, l.conflicts).join(", ")}</dd></>)}
              <dt>Distributors</dt><dd>{nameOf(ref.distributors, l.distributors).join(", ") || "—"}</dd>
              <dt>Commission</dt><dd>{terms?.commission_model ? `${MODEL[terms.commission_model]}${rate ? ` · ${rate}` : ""}${terms.retainer != null ? ` · $${Number(terms.retainer).toLocaleString("en-US")}/month retainer` : ""}` : "—"}</dd>
              <dt>Minimum term</dt><dd>{terms?.min_term_months != null ? `${terms.min_term_months} months` : "—"}</dd>
              <dt>Years in business</dt><dd>{terms?.years_in_business ?? "—"}</dd>
              <dt>Team</dt><dd>{terms?.team_size != null ? `${terms.team_size} people` : "—"}{terms?.merchandisers ? ` · ${terms.merchandisers} retail merchandisers` : ""}</dd>
              {terms?.current_lines && (<><dt>Current lines</dt><dd style={{ whiteSpace: "pre-line" }}>{terms.current_lines}</dd></>)}
              {docs && docs.length > 0 && (<><dt>Documents</dt><dd className="bench-stack" style={{ gap: 4 }}>{docs.map((d) => <DocLink key={d.id} id={d.id} name={d.file_name} />)}</dd></>)}
            </dl>
          </section>
          <section id="reviews" className="bench-section bench-stack" aria-labelledby="rev-h">
            <div className="bench-row" style={{ justifyContent: "space-between" }}>
              <h2 id="rev-h" className="bench-h-section" style={{ fontSize: "1.75rem", margin: 0 }}>Reviews</h2>
              {avg != null && <RatingSummary average={Math.round(avg * 10) / 10} count={reviews.length} />}
            </div>
            <p className="bench-small bench-muted" style={{ margin: 0 }}>Only brands {l.name} has worked with on Bench can review. Ratings never change search ranking.</p>
            {isBrand && (canReview.data
              ? <ReviewForm listingId={l.id} slug={l.slug} brokerName={l.name} brandName={session!.org!.name} existing={myReview} referenceGiven={!!myRef.data} />
              : !myReview && <p className="bench-notice" style={{ margin: 0 }}>You can review {l.name} once they&rsquo;ve replied to a message from you.</p>)}
            {reviews.length ? <ReviewList reviews={reviews} brokerName={l.name} slug={l.slug} ownListing={own} /> : <p className="bench-muted" style={{ margin: 0 }}>No reviews yet.</p>}
          </section>
        </div>
        <aside className="bench-stack bench-builder_side">
          {viewer === "brand" && <Link className="button w-button bench-btn-block" href={`/app/inbox/new?broker=${l.slug}`}>Message {l.name}</Link>}
          {viewer === "anon" && <Link className="button w-button bench-btn-block" href={`/sign-up?role=brand&next=${encodeURIComponent(`/app/inbox/new?broker=${l.slug}`)}`}>Message {l.name}</Link>}
          <ContactBlock listingId={l.id} name={l.name} viewer={viewer} next={`/brokers/${l.slug}`} />
          <p className="bench-small bench-muted" style={{ margin: 0 }}>Ranked by fit only. Brokers can&rsquo;t pay for position.</p>
        </aside>
      </div>
    </>
  );
}
