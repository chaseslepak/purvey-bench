import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingCard } from "@/components/listing/ListingCard";
import { CtaBand } from "@/components/site/CtaBand";
import { getReference } from "@/lib/reference";
import { cardData, matches, type Filters } from "@/lib/search";
import { loadLiveListings, loadRatings, loadResponsiveness } from "@/lib/search-data";
import { FREQ_LABEL } from "@/lib/coverage";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 3600;

async function retailerBySlug(slug: string) {
  const db = await createClient();
  const { data } = await db.from("retailers").select("id, name, slug").eq("slug", slug).eq("active", true).maybeSingle();
  return data as { id: number; name: string; slug: string } | null;
}

export async function generateMetadata({ params }: { params: Promise<{ retailer: string }> }): Promise<Metadata> {
  const r = await retailerBySlug((await params).retailer);
  if (!r) return { title: "Brokers by retailer" };
  // Thin pages stay out of search until a live broker covers the retailer.
  const [all, ref] = await Promise.all([loadLiveListings(), getReference()]);
  const covered = all.some((l) => matches(l, { retailer: r.id }, ref));
  return {
    ...(covered ? {} : { robots: { index: false, follow: true } }),
    title: `Food and beverage brokers who call on ${r.name}`,
    description: `Independent food and beverage brokers who call on ${r.name}, with how often they visit, the states they cover and how quickly they answer brands. Free for brands.`,
    alternates: { canonical: `/brokers-for/${r.slug}` },
  };
}

/** Public, indexable page per retailer: the brokers on Bench who call on it. */
export default async function BrokersForRetailer({ params }: { params: Promise<{ retailer: string }> }) {
  const r = await retailerBySlug((await params).retailer);
  if (!r) notFound();
  const [all, ref] = await Promise.all([loadLiveListings(), getReference()]);
  const f: Filters = { retailer: r.id };
  const hits = all.filter((l) => matches(l, f, ref))
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.updatedAt.localeCompare(a.updatedAt));
  const shown = hits.slice(0, 24);
  const [ratings, response] = await Promise.all([loadRatings(shown.map((l) => l.id)), loadResponsiveness(shown.map((l) => l.orgId))]);
  const weekly = hits.filter((l) => l.retailers.some((x) => x.retailerId === r.id && x.freq === "weekly")).length;

  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">Brokers by retailer</div>
        <h1 className="bench-h-section">Food and beverage brokers who call on {r.name}</h1>
        <p className="bench-lede" style={{ margin: 0 }}>
          {hits.length
            ? `${hits.length} broker${hits.length === 1 ? "" : "s"} on Purvey Bench list ${r.name} as an account they call on${weekly ? `, ${weekly} of them ${FREQ_LABEL.weekly.toLowerCase()}` : ""}. Brands search, compare and message them for free.`
            : `No broker on Purvey Bench lists ${r.name} yet. Brokers are joining now; save a search and we’ll email you when one does.`}
        </p>
        <div className="bench-row">
          <Link href={`/find?retailer=${r.id}`} className="button w-button">Search and filter these brokers</Link>
          <Link href="/sign-up?role=brand" className="button bench-btn-ghost w-button">Create a free brand account</Link>
        </div>
      </section>
      {shown.length > 0 && (
        <ul className="bench-results">
          {shown.map((l) => (
            <li key={l.id} className="bench-result">
              <Link href={`/brokers/${l.slug}`} className="bench-result_link">
                <ListingCard data={cardData({ ...l, fit: null }, ref, null, ratings.get(l.id), { response: response.get(l.orgId) })} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hits.length > shown.length && <p className="bench-small" style={{ textAlign: "center" }}><Link className="bench-link" href={`/find?retailer=${r.id}`}>See all {hits.length} brokers</Link></p>}
      <section className="bench-section bench-stack">
        <h2 className="bench-h-section" style={{ fontSize: "1.75rem" }}>Before you reach out</h2>
        <p style={{ margin: 0 }}>Our <Link className="bench-link" href="/resources/broker-kit">broker kit</Link> has a Broker-Ready checklist, the questions to ask on a first call and the terms to settle in a broker agreement.</p>
        <p className="bench-small bench-muted" style={{ margin: 0 }}>Are you a broker who calls on {r.name}? <Link className="bench-link" href="/for-brokers">List your brokerage</Link>.</p>
      </section>
      <CtaBand />
    </>
  );
}
