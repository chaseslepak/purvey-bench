import type { Metadata } from "next";
import Link from "next/link";
import { ListingCard } from "@/components/listing/ListingCard";
import { RetailerFilter } from "@/components/brand/RetailerFilter";
import { SaveButton } from "@/components/brand/SaveButton";
import { getReference } from "@/lib/reference";
import { briefToFit, cardData, parseFilters, search, type BriefRow, type Filters } from "@/lib/search";
import { loadLiveListings } from "@/lib/search-data";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Find a food and beverage broker",
  description: "Search food and beverage brokers by the retailers, states, channels and distributors they cover. Free for brands.",
};

const LOOSEN_LABEL: Record<string, string> = {
  state: "state", region: "region", channel: "channel", category: "category", distributor: "distributor", retailer: "retailer", verified: "verified only", taking: "taking new lines",
};

function href(f: Filters, patch: Partial<Record<keyof Filters, string | number | undefined>>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...patch })) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return `/find${s ? `?${s}` : ""}`;
}

export default async function Find({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const [session, ref, all] = await Promise.all([getSession(), getReference(), loadLiveListings()]);
  const isBrand = session?.org?.type === "brand";
  const db = await createClient();

  let briefs: BriefRow[] = [];
  let saved = new Set<string>();
  if (isBrand) {
    const [b, s] = await Promise.all([
      db.from("briefs").select("*").is("archived_at", null).order("updated_at", { ascending: false }),
      db.from("saved_brokers").select("listing_id"),
    ]);
    briefs = (b.data ?? []) as BriefRow[];
    saved = new Set((s.data ?? []).map((r) => r.listing_id as string));
  }
  // Default to the most recently updated brief; "none" turns it off.
  const raw = await searchParams;
  const briefOff = raw.brief === "none";
  const brief = briefOff ? null : briefs.find((b) => b.id === f.brief) ?? briefs[0] ?? null;
  const fitBrief = brief ? briefToFit(brief, ref) : null;
  const conflictName = brief?.category_id ? ref.categories.find((c) => c.id === brief.category_id)?.name : null;

  const r = search(all, f, ref, fitBrief);

  // Analytics: what was searched (filters only) and which listings were shown.
  const filters = { states: f.state ? [f.state] : [], retailers: f.retailer ? [f.retailer] : [], channels: f.channel ? [f.channel] : [], categories: f.category ? [f.category] : [], distributors: f.distributor ? [f.distributor] : [] };
  await Promise.all([
    db.rpc("log_search", { p_filters: filters }),
    r.items.length ? db.rpc("log_profile_events", { p_listings: r.items.map((i) => i.id), p_type: "search_impression" }) : null,
  ]);

  const nextPath = href(f, {});
  const select = (name: keyof Filters, label: string, options: { value: string | number; label: string }[], anyLabel: string | null = "Any") => (
    <div className="bench-field">
      <label htmlFor={`f-${name}`} className="bench-label">{label}</label>
      <select id={`f-${name}`} name={name} className="bench-input" defaultValue={f[name] !== undefined ? String(f[name]) : name === "sort" ? r.sort : ""}>
        {anyLabel && <option value="">{anyLabel}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">Find a broker</div>
        <h1 className="bench-h-section">Brokers who already call on your buyers</h1>
        <p className="bench-lede" style={{ margin: 0 }}>
          Filter by the retailers, states, channels and distributors you need. Ranking is by fit to your brief only; no broker can pay for position.
        </p>
      </section>

      <div className="bench-find">
        <form className="bench-section bench-stack bench-find_filters" method="get" action="/find" aria-label="Search filters">
          {isBrand && (
            <div className="bench-field">
              <label htmlFor="f-brief" className="bench-label">Rank against brief</label>
              <select id="f-brief" name="brief" className="bench-input" defaultValue={briefOff ? "none" : brief?.id ?? "none"}>
                <option value="none">No brief</option>
                {briefs.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
              {!briefs.length && <p className="bench-hint" style={{ margin: 0 }}><Link className="bench-link" href="/app/briefs">Write a brief</Link> to rank brokers by fit.</p>}
            </div>
          )}
          {select("state", "State", ref.states.map((s) => ({ value: s.code, label: s.name })))}
          {select("region", "Region", ref.regions.map((s) => ({ value: s.code, label: s.name })))}
          <RetailerFilter options={ref.retailers} initial={f.retailer} />
          {select("channel", "Channel", ref.channels.map((c) => ({ value: c.id, label: c.name })))}
          {select("category", "Category", ref.categories.map((c) => ({ value: c.id, label: c.name })))}
          {select("distributor", "Distributor", ref.distributors.map((c) => ({ value: c.id, label: c.name })))}
          <label className="bench-row bench-small" style={{ gap: 8 }}><input type="checkbox" name="verified" value="1" defaultChecked={!!f.verified} /> Verified only</label>
          <label className="bench-row bench-small" style={{ gap: 8 }}><input type="checkbox" name="taking" value="1" defaultChecked={!!f.taking} /> Taking new lines</label>
          {select("sort", "Sort", [...(fitBrief ? [{ value: "fit", label: "Best fit to brief" }] : []), { value: "verified", label: "Verified first" }, { value: "recent", label: "Recently updated" }], null)}
          <div className="bench-row">
            <button type="submit" className="button w-button">Search</button>
            <Link href="/find" className="bench-link bench-small">Clear filters</Link>
          </div>
        </form>

        <section className="bench-stack" aria-labelledby="results-h" style={{ minWidth: 0 }}>
          <div className="bench-row bench-toolbar" style={{ justifyContent: "space-between" }}>
            <h2 id="results-h" className="bench-eyebrow" style={{ margin: 0 }} aria-live="polite">
              {r.total} broker{r.total === 1 ? "" : "s"}{brief ? ` · ranked for “${brief.title}”` : ""}
            </h2>
            {!session && <Link className="bench-small bench-link" href="/sign-up?role=brand">Create a free account to see contact details</Link>}
          </div>

          {r.total === 0 ? (
            <div className="bench-section is-cream bench-stack">
              <h3 className="bench-h-section" style={{ fontSize: "1.5rem" }}>No brokers match all of these filters</h3>
              {r.loosen ? (
                <p style={{ margin: 0 }}>
                  Remove the <strong>{LOOSEN_LABEL[r.loosen.key]}</strong> filter to see {r.loosen.count} broker{r.loosen.count === 1 ? "" : "s"}.{" "}
                  <Link className="bench-link" href={href(f, { [r.loosen.key]: undefined, page: undefined })}>Remove it</Link>
                </p>
              ) : (
                <p style={{ margin: 0 }}>{all.length ? <Link className="bench-link" href="/find">Clear all filters</Link> : "Brokers are joining now. Check back soon."}</p>
              )}
            </div>
          ) : (
            <ul className="bench-results">
              {r.items.map((l) => (
                <li key={l.id} className="bench-result">
                  <Link href={`/brokers/${l.slug}`} className="bench-result_link" aria-label={`${l.name} profile`}>
                    <ListingCard data={cardData(l, ref, conflictName)} />
                  </Link>
                  <div className="bench-result_actions">
                    <SaveButton listingId={l.id} name={l.name} initial={saved.has(l.id)} signedIn={!!session} isBrand={isBrand} next={nextPath} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {r.pages > 1 && (
            <nav className="bench-row" aria-label="Pages" style={{ justifyContent: "center" }}>
              {r.page > 1 && <Link className="button bench-btn-ghost is-small w-button" href={href(f, { page: r.page - 1 })}>Previous</Link>}
              <span className="bench-small">Page {r.page} of {r.pages}</span>
              {r.page < r.pages && <Link className="button bench-btn-ghost is-small w-button" href={href(f, { page: r.page + 1 })}>Next</Link>}
            </nav>
          )}
        </section>
      </div>
    </>
  );
}
