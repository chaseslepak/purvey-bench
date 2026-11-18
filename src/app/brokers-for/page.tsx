import type { Metadata } from "next";
import Link from "next/link";
import { getReference } from "@/lib/reference";
import { loadLiveListings } from "@/lib/search-data";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Food and beverage brokers by retailer",
  description: "Find independent food and beverage brokers by the retailers they actually call on. Free for brands.",
};

/** Index of retailers that at least one live broker calls on. */
export default async function BrokersByRetailer() {
  const [all, ref] = await Promise.all([loadLiveListings(), getReference()]);
  const count = new Map<number, number>();
  for (const l of all) for (const id of new Set(l.retailers.map((r) => r.retailerId).filter(Boolean) as number[])) count.set(id, (count.get(id) ?? 0) + 1);
  const db = await createClient();
  const { data: slugs } = await db.from("retailers").select("id, slug").eq("active", true);
  const slugOf = new Map((slugs ?? []).map((r) => [r.id as number, r.slug as string]));
  const rows = ref.retailers.filter((r) => count.get(r.id) && slugOf.get(r.id)).sort((a, b) => (count.get(b.id)! - count.get(a.id)!) || a.name.localeCompare(b.name));
  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">Brokers by retailer</div>
        <h1 className="bench-h-section">Find brokers by the retailers they call on</h1>
        <p className="bench-lede" style={{ margin: 0 }}>Every broker on Purvey Bench lists the accounts they call on and how often. Pick a retailer to see who covers it.</p>
      </section>
      <section className="bench-section">
        {rows.length ? (
          <ul className="bench-retailer-index">
            {rows.map((r) => (
              <li key={r.id}><Link className="bench-link" href={`/brokers-for/${slugOf.get(r.id)}`}>{r.name}</Link> <span className="bench-muted bench-small">{count.get(r.id)} broker{count.get(r.id) === 1 ? "" : "s"}</span></li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0 }}>Brokers are joining Bench now. <Link className="bench-link" href="/find">Search the directory</Link>.</p>
        )}
      </section>
    </>
  );
}
