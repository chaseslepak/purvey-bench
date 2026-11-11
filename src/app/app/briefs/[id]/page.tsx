import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BriefEditor } from "./BriefEditor";
import { duplicateBrief, setArchived } from "../actions";
import { ListingCard } from "@/components/listing/ListingCard";
import { getReference } from "@/lib/reference";
import { briefToFit, cardData, search, type BriefRow } from "@/lib/search";
import { loadLiveListings } from "@/lib/search-data";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Brief", robots: { index: false } };

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  if (session.org.type !== "brand") redirect("/app");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await createClient();
  const { data: brief } = await db.from("briefs").select("*").eq("id", id).maybeSingle();
  if (!brief) notFound();
  const [ref, all] = await Promise.all([getReference(), loadLiveListings()]);
  const b = brief as BriefRow;
  const fit = briefToFit(b, ref);
  const ranked = search(all, { sort: "fit" }, ref, fit).items.filter((l) => l.fit).slice(0, 10);
  const conflictName = b.category_id ? ref.categories.find((c) => c.id === b.category_id)?.name : null;
  const anySet = fit.states.length || fit.retailers.length || fit.channels.length || fit.categoryId || fit.distributors.length;

  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="bench-row" style={{ justifyContent: "space-between" }}>
          <div className="text_title"><Link className="bench-link" href="/app/briefs">Briefs</Link> · private to your team</div>
          <div className="bench-row">
            <form action={duplicateBrief}><input type="hidden" name="id" value={b.id} /><button className="button bench-btn-ghost is-small w-button" type="submit">Duplicate</button></form>
            <form action={setArchived}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="archive" value={b.archived_at ? "0" : "1"} /><button className="button bench-btn-ghost is-small w-button" type="submit">{b.archived_at ? "Restore" : "Archive"}</button></form>
            <Link className="button is-small w-button" href={`/find?brief=${b.id}`}>Search with this brief</Link>
          </div>
        </div>
        <h1 className="bench-h-section">{b.title}</h1>
      </section>
      <div className="bench-builder_grid">
        <section className="bench-section">
          <BriefEditor id={b.id} refs={ref} initial={{
            title: b.title, categoryId: b.category_id, regions: b.regions, states: b.states, channels: b.channels,
            retailers: b.target_retailers, distributors: b.distributors, notes: b.notes ?? "",
          }} />
        </section>
        <aside className="bench-stack">
          <h2 className="bench-eyebrow" style={{ margin: 0 }}>Top {ranked.length || 10} brokers for this brief</h2>
          {!anySet ? (
            <p className="bench-notice" style={{ margin: 0 }}>Add states, retailers, channels, a category or distributors to rank brokers.</p>
          ) : ranked.length === 0 ? (
            <p className="bench-notice" style={{ margin: 0 }}>No live brokers yet. Check back as brokers join.</p>
          ) : (
            <ol className="bench-plainlist" style={{ gap: 12 }}>
              {ranked.map((l) => (
                <li key={l.id}><Link href={`/brokers/${l.slug}`} className="bench-result_link"><ListingCard data={cardData(l, ref, conflictName)} /></Link></li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </>
  );
}
