import type { Metadata } from "next";
import Link from "next/link";
import { ListingCard } from "@/components/listing/ListingCard";
import { RetailerFilter } from "@/components/brand/RetailerFilter";
import { SaveButton } from "@/components/brand/SaveButton";
import { getReference } from "@/lib/reference";
import { FilterPanel } from "./FilterPanel";
import { siteLinks } from "@/lib/site";
import { briefToFit, cardData, parseFilters, search, type BriefRow, type Filters } from "@/lib/search";
import { loadLiveListings, loadRatings } from "@/lib/search-data";
import { loadBrand } from "@/lib/brand-data";
import { profileToFit } from "@/lib/brand-profile";
import type { FitBrief } from "@/lib/fit";
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
  // The brand profile's goals rank results when picked, or when the brand has no brief.
  let profileFit: FitBrief | null = null;
  let profileCategory: number | null = null;
  if (isBrand) {
    const b = await loadBrand(db, session!.org!.id);
    if (b) { profileFit = profileToFit(b.profile, ref.states); profileCategory = b.profile.categories[0] ?? null; }
  }
  const useProfile = !briefOff && !!profileFit && (f.brief === "profile" || (!f.brief && !briefs.length));
  const brief = briefOff || useProfile ? null : briefs.find((b) => b.id === f.brief) ?? briefs[0] ?? null;
  const fitBrief = useProfile ? profileFit : brief ? briefToFit(brief, ref) : null;
  const conflictId = useProfile ? profileCategory : brief?.category_id;
  const conflictName = conflictId ? ref.categories.find((c) => c.id === conflictId)?.name : null;

  const r = search(all, f, ref, fitBrief);

  // Analytics: what was searched (filters only) and which listings were shown.
  const filters = { states: f.state ? [f.state] : [], retailers: f.retailer ? [f.retailer] : [], channels: f.channel ? [f.channel] : [], categories: f.category ? [f.category] : [], distributors: f.distributor ? [f.distributor] : [] };
  // Count brand and visitor searches once: not brokers browsing, not later pages of the same search.
  const logIt = session?.org?.type !== "broker" && !raw.page;
  const [ratings] = await Promise.all([
    loadRatings(r.items.map((i) => i.id)),
    logIt ? db.rpc("log_search", { p_filters: filters }) : null,
    logIt && r.items.length ? db.rpc("log_profile_events", { p_listings: r.items.map((i) => i.id), p_type: "search_impression" }) : null,
  ]);
  const activeFilters = [f.state, f.region, f.retailer, f.channel, f.category, f.distributor, f.verified, f.taking].filter((v) => v !== undefined && v !== "" && v !== 0).length;

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
          <FilterPanel active={activeFilters}>
          {isBrand && (
            <div className="bench-field">
              <label htmlFor="f-brief" className="bench-label">Rank against brief</label>
              <select id="f-brief" name="brief" className="bench-input" defaultValue={briefOff ? "none" : useProfile ? "profile" : brief?.id ?? "none"}>
                {profileFit && <option value="profile">Your brand profile</option>}
                {briefs.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                <option value="none">No ranking</option>
              </select>
              {!briefs.length && !profileFit && <p className="bench-hint" style={{ margin: 0 }}>Add <Link className="bench-link" href="/app/brand?step=goals">where you want to be</Link> to your brand profile to rank brokers by fit.</p>}
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
          {select("sort", "Sort", [...(fitBrief ? [{ value: "fit", label: "Best fit to brief" }] : []), { value: "recent", label: "Recently updated" }, { value: "verified", label: "Verified first" }], null)}
          <div className="bench-row">
            <button type="submit" className="button w-button">Search</button>
            <Link href="/find" className="bench-link bench-small">Clear filters</Link>
          </div>
          </FilterPanel>
        </form>

        <section className="bench-stack" aria-labelledby="results-h" style={{ minWidth: 0 }}>
          <div className="bench-row bench-toolbar" style={{ justifyContent: "space-between" }}>
            <h2 id="results-h" className="bench-eyebrow" style={{ margin: 0 }} aria-live="polite">
              {r.total} broker{r.total === 1 ? "" : "s"}{useProfile ? " · ranked for your brand profile" : brief ? ` · ranked for “${brief.title}”` : ""}
            </h2>
            {!session && r.total > 0 && <Link className="bench-small bench-link" href="/sign-up?role=brand">Create a free account to see contact details</Link>}
          </div>

          {r.total === 0 ? (
            <div className="bench-section is-cream bench-stack">
              <h3 className="bench-h-section" style={{ fontSize: "1.5rem" }}>{activeFilters || !all.length ? (all.length ? "No brokers match all of these filters" : "Brokers are joining Bench now") : "No brokers to show yet"}</h3>
              {!all.length ? (
                <>
                  <p style={{ margin: 0 }}>
                    {isBrand
                      ? <>Set the retailers and regions you&rsquo;re targeting in <Link className="bench-link" href="/app/brand?step=goals">your brand profile</Link> and we&rsquo;ll rank brokers for you as they list.</>
                      : <>Tell us the retailers you need with a free brand account and we&rsquo;ll rank brokers for you as they list. <Link className="bench-link" href="/sign-up?role=brand&next=%2Ffind">Create a free account</Link>.</>}
                  </p>
                  <p style={{ margin: 0 }}>Need a broker sooner? <a className="bench-link" href={siteLinks.contact}>Book a strategy call</a> and Purvey can run the placement for you.</p>
                  {!isBrand && <p className="bench-small bench-muted" style={{ margin: 0 }}>Are you a broker? <Link className="bench-link" href="/for-brokers">List your brokerage</Link>.</p>}
                </>
              ) : r.loosen ? (
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
                  <Link href={`/brokers/${l.slug}`} className="bench-result_link">
                    <ListingCard data={cardData(l, ref, conflictName, ratings.get(l.id))} />
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
