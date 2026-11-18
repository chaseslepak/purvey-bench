import type { Metadata } from "next";
import Link from "next/link";
import { getReference } from "@/lib/reference";
import { loadLiveListings } from "@/lib/search-data";
import { stateSlug } from "@/lib/state-slug";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Food and beverage brokers by state",
  description: "Find independent food and beverage brokers by the states they cover, with the retailers they call on. Free for brands.",
};

/** Index of states, grouped by region, with how many live brokers cover each. */
export default async function BrokersByState() {
  const [all, ref] = await Promise.all([loadLiveListings(), getReference()]);
  const count = new Map<string, number>();
  for (const l of all) for (const s of new Set(l.states)) count.set(s, (count.get(s) ?? 0) + 1);
  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">Brokers by state</div>
        <h1 className="bench-h-section">Find brokers by the states they cover</h1>
        <p className="bench-lede" style={{ margin: 0 }}>Every broker on Purvey Bench lists the states they cover and the accounts they call on. Pick a state to see who is there.</p>
      </section>
      <section className="bench-section bench-stack">
        {ref.regions.map((r) => {
          const states = ref.states.filter((s) => s.region_code === r.code);
          if (!states.length) return null;
          return (
            <div key={r.code} className="bench-stack">
              <h2 className="bench-h-section" style={{ fontSize: "1.25rem", margin: 0 }}>{r.name}</h2>
              <ul className="bench-retailer-index">
                {states.map((s) => (
                  <li key={s.code}>
                    <Link className="bench-link" href={`/brokers-in/${stateSlug(s)}`}>{s.name}</Link>{" "}
                    {count.get(s.code) ? <span className="bench-muted bench-small">{count.get(s.code)} broker{count.get(s.code) === 1 ? "" : "s"}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </>
  );
}
