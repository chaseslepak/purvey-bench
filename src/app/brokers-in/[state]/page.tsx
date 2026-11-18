import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingCard } from "@/components/listing/ListingCard";
import { CtaBand } from "@/components/site/CtaBand";
import { getReference } from "@/lib/reference";
import { cardData, matches, type Filters } from "@/lib/search";
import { loadLiveListings, loadRatings, loadResponsiveness } from "@/lib/search-data";

export const revalidate = 3600;


import { stateSlug } from "@/lib/state-slug";
async function stateBySlug(slug: string) {
  const ref = await getReference();
  const st = ref.states.find((s) => stateSlug(s) === slug.toLowerCase() || s.code.toLowerCase() === slug.toLowerCase()) ?? null;
  return { st, ref };
}

export async function generateMetadata({ params }: { params: Promise<{ state: string }> }): Promise<Metadata> {
  const { st, ref } = await stateBySlug((await params).state);
  if (!st) return { title: "Brokers by state" };
  const all = await loadLiveListings();
  const covered = all.some((l) => matches(l, { state: st.code }, ref));
  return {
    ...(covered ? {} : { robots: { index: false, follow: true } }),
    title: `Food and beverage brokers in ${st.name}`,
    description: `Independent food and beverage brokers who cover ${st.name}: the retailers they call on, how often they visit and how quickly they answer brands. Free for brands.`,
    alternates: { canonical: `/brokers-in/${stateSlug(st)}` },
  };
}

/** Public, indexable page per state: the brokers on Bench who cover it. */
export default async function BrokersInState({ params }: { params: Promise<{ state: string }> }) {
  const { st, ref } = await stateBySlug((await params).state);
  if (!st) notFound();
  const all = await loadLiveListings();
  const f: Filters = { state: st.code };
  const hits = all.filter((l) => matches(l, f, ref))
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.updatedAt.localeCompare(a.updatedAt));
  const shown = hits.slice(0, 24);
  const [ratings, response] = await Promise.all([loadRatings(shown.map((l) => l.id)), loadResponsiveness(shown.map((l) => l.orgId))]);
  const region = ref.regions.find((r) => r.code === st.region_code);

  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">Brokers by state</div>
        <h1 className="bench-h-section">Food and beverage brokers in {st.name}</h1>
        <p className="bench-lede" style={{ margin: 0 }}>
          {hits.length
            ? `${hits.length} broker${hits.length === 1 ? "" : "s"} on Purvey Bench cover ${st.name}. See the retailers each one calls on, compare them and message them for free.`
            : `No broker on Purvey Bench covers ${st.name} yet. Brokers are joining now; save a search and we’ll email you when one does.`}
        </p>
        <div className="bench-row">
          <Link href={`/find?state=${st.code}`} className="button w-button">Search and filter these brokers</Link>
          {region && <Link href={`/find?region=${region.code}`} className="button bench-btn-ghost w-button">All of the {region.name}</Link>}
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
      {hits.length > shown.length && <p className="bench-small" style={{ textAlign: "center" }}><Link className="bench-link" href={`/find?state=${st.code}`}>See all {hits.length} brokers</Link></p>}
      <section className="bench-section bench-stack">
        <h2 className="bench-h-section" style={{ fontSize: "1.75rem" }}>Before you reach out</h2>
        <p style={{ margin: 0 }}>Our <Link className="bench-link" href="/resources/broker-kit">broker kit</Link> has a Broker-Ready checklist, the questions to ask on a first call and the terms to settle in a broker agreement. Prefer to search by account? <Link className="bench-link" href="/brokers-for">Find brokers by retailer</Link>.</p>
        <p className="bench-small bench-muted" style={{ margin: 0 }}>Are you a broker who covers {st.name}? <Link className="bench-link" href="/for-brokers">List your brokerage</Link>.</p>
      </section>
      <CtaBand />
    </>
  );
}
