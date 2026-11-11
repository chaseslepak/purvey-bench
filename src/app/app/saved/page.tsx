import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SavedFields } from "./SavedItem";
import { ListingCard } from "@/components/listing/ListingCard";
import { SaveButton } from "@/components/brand/SaveButton";
import { getReference } from "@/lib/reference";
import { cardData } from "@/lib/search";
import { loadLiveListings } from "@/lib/search-data";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Saved brokers", robots: { index: false } };

export default async function Saved({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  if (session.org.type !== "brand") redirect("/app");
  const { folder } = await searchParams;
  const db = await createClient();
  const [{ data: saved }, all, ref] = await Promise.all([
    db.from("saved_brokers").select("id, listing_id, folder, note, created_at").order("created_at", { ascending: false }),
    loadLiveListings(),
    getReference(),
  ]);
  const byId = new Map(all.map((l) => [l.id, l]));
  const folders = [...new Set((saved ?? []).map((s) => s.folder).filter(Boolean) as string[])].sort();
  const items = (saved ?? []).filter((s) => !folder || s.folder === folder);

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
        <form action="/app/saved/compare" method="get" className="bench-stack">
          <div className="bench-row" style={{ justifyContent: "space-between" }}>
            <p className="bench-small bench-muted" style={{ margin: 0 }}>Tick up to three brokers to compare.</p>
            <button type="submit" className="button is-small w-button">Compare selected</button>
          </div>
          <ul className="bench-results">
            {items.map((s) => {
              const l = byId.get(s.listing_id);
              return (
                <li key={s.id} className="bench-section bench-stack" style={{ padding: 20 }}>
                  {l ? (
                    <>
                      <Link href={`/brokers/${l.slug}`} className="bench-result_link"><ListingCard data={cardData({ ...l, fit: null }, ref)} /></Link>
                      <div className="bench-row" style={{ justifyContent: "space-between" }}>
                        <label className="bench-row bench-small" style={{ gap: 8 }}><input type="checkbox" name="ids" value={l.id} /> Compare</label>
                        <SaveButton listingId={l.id} name={l.name} initial signedIn isBrand next="/app/saved" />
                      </div>
                    </>
                  ) : (
                    <p className="bench-notice" style={{ margin: 0 }}>This broker is no longer listed.</p>
                  )}
                  <SavedFields id={s.id} folder={s.folder ?? ""} note={s.note ?? ""} folders={folders} name={l?.name ?? "this broker"} />
                </li>
              );
            })}
          </ul>
        </form>
      )}
    </>
  );
}
