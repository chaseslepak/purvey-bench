import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReviewList, type PublicReview } from "@/components/reviews/ReviewList";
import { RatingSummary } from "@/components/reviews/Stars";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reviews", robots: { index: false } };

/** A brokerage's reviews: reply publicly, or flag one for Purvey. */
export default async function BrokerReviews() {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  if (session.org.type !== "broker") redirect("/app");
  const db = await createClient();
  const { data: l } = await db.from("broker_listings").select("id").eq("org_id", session.org.id).maybeSingle();
  const { data } = l ? await db.rpc("listing_reviews", { p_listing: l.id }) : { data: [] };
  const reviews = (data ?? []) as PublicReview[];
  const avg = reviews.length ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10 : null;
  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">{session.org.name}</div>
        <h1 className="bench-h-section">Reviews</h1>
        <p className="bench-lede" style={{ margin: 0 }}>
          Brands you&rsquo;ve replied to on Bench can rate and review you. Reviews show on your profile and search card; they never change your ranking.
          Reply publicly, or flag a review you think is unfair and Purvey will look at it.
        </p>
        {avg != null && <RatingSummary average={avg} count={reviews.length} />}
      </section>
      <section className="bench-section bench-stack">
        {reviews.length ? (
          <ReviewList reviews={reviews} brokerName={session.org.name} slug={session.org.slug} ownListing />
        ) : (
          <p className="bench-muted" style={{ margin: 0 }}>No reviews yet. After you&rsquo;ve worked with a brand, ask them to review you from your <Link className="bench-link" href={`/brokers/${session.org.slug}#reviews`}>profile page</Link>.</p>
        )}
      </section>
    </>
  );
}
