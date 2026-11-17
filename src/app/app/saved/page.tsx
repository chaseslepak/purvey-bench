import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CompareSubmit } from "./CompareSubmit";
import { SavedFields } from "./SavedItem";
import { SavedSearchRow } from "./SavedSearchRow";
import { describeSearch, searchHref, type SavedFilters } from "@/lib/saved-search";
import { ListingCard } from "@/components/listing/ListingCard";
import { SaveButton } from "@/components/brand/SaveButton";
import { getReference } from "@/lib/reference";
import { cardData } from "@/lib/search";
import { loadLiveListings, loadRatings } from "@/lib/search-data";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Saved brokers", robots: { index: false } };

export default async function Saved({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  if (session.org.type !== "brand") redirect("/app");
  const { folder } = await searchParams;
  const db = await createClient();
  const [{ data: saved }, all, ref, { data: searches }] = await Promise.all([
    db.from("saved_brokers").select("id, listing_id, folder, note, created_at").order("created_at", { ascending: false }),
    loadLiveListings(),
    getReference(),
    db.from("saved_searches").select("id, name, filters, alerts").order("created_at", { ascending: false }),
  ]);
  const byId = new Map(all.map((l) => [l.id, l]));
  const folders = [...new Set((saved ?? []).map((s) => s.folder).filter(Boolean) as string[])].sort();
  const items = (saved ?? []).filter((s) => !folder || s.folder === folder);
  const ratings = await loadRatings(items.map((s) => s.listing_id as string));

  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">Your shortlist</div>
        <h1 className="bench-h-section">Saved brokers</h1>
        <p className="bench-lede" style={{ margin: 0 }}>Group brokers into folders, keep private notes, and compare up to three side by side.</p>
        {folders.length > 0 && (
          <nav className="bench-chips" aria-label="Folders">
            <Link className="bench-chip" aria-current={!folder ? "page" : undefined} href="/app/saved">All</Link>
            {folders.map((f) => <Link key={f} className="bench-chip" aria-current={folder === f ? "page" : undefined} href={`/app/saved?folder=${encodeURIComponent(f)}`}>{f}</Link>)}
          </nav>
        )}
      </section>
      {items.length === 0 ? (
        <section className="bench-section"><p style={{ margin: 0 }}>Nothing saved yet. <Link className="bench-link" href="/find">Find brokers</Link> and choose Save.</p></section>
      ) : (
        <div className="bench-stack">
          {/* Only the Compare checkboxes belong to this form, so Enter in a folder or note never submits it. */}
          <form id="compare" action="/app/saved/compare" method="get" />
          <div className="bench-row" style={{ justifyContent: "flex-end" }}>
            <CompareSubmit form="compare" />
          </div>
          <ul className="bench-results">
            {items.map((s) => {
              const l = byId.get(s.listing_id);
              return (
                <li key={s.id} className="bench-section bench-stack" style={{ padding: 20 }}>
                  {l ? (
                    <>
                      <Link href={`/brokers/${l.slug}`} className="bench-result_link"><ListingCard data={cardData({ ...l, fit: null }, ref, null, ratings.get(l.id))} /></Link>
                      <div className="bench-row" style={{ justifyContent: "space-between" }}>
                        <label className="bench-row bench-small" style={{ gap: 8 }}><input type="checkbox" form="compare" name="ids" value={l.id} /> Compare</label>
                        <SaveButton listingId={l.id} name={l.name} initial signedIn isBrand remove next="/app/saved" />
                      </div>
                    </>
                  ) : (
                    <div className="bench-row" style={{ justifyContent: "space-between" }}>
                      <p className="bench-notice" style={{ margin: 0 }}>This broker isn&rsquo;t listed right now.</p>
                      <SaveButton listingId={s.listing_id} name="this broker" initial signedIn isBrand remove next="/app/saved" />
                    </div>
                  )}
                  <SavedFields id={s.id} folder={s.folder ?? ""} note={s.note ?? ""} folders={folders} name={l?.name ?? "this broker"} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <section id="searches" className="bench-section bench-stack" aria-labelledby="searches-h">
        <h2 id="searches-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>Saved searches</h2>
        {searches?.length ? (
          <>
            <p className="bench-muted" style={{ margin: 0 }}>Run a search again in one click. With weekly email on, we&rsquo;ll tell you when brokers that match go live.</p>
            <ul className="bench-stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 10 }}>
              {searches.map((x) => (
                <SavedSearchRow key={x.id} id={x.id} name={x.name} alerts={x.alerts}
                  description={describeSearch(x.filters as SavedFilters, ref)} href={searchHref(x.filters as SavedFilters)} />
              ))}
            </ul>
          </>
        ) : (
          <p style={{ margin: 0 }}>No saved searches yet. On <Link className="bench-link" href="/find">Find brokers</Link>, set your filters and choose Save this search.</p>
        )}
      </section>
    </>
  );
}
