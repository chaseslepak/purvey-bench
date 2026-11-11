import { BrandFileLink } from "./BrandFileLink";
import { CERTIFICATIONS, COMMISSION, DATA_ROOM_FOLDERS, label, REVENUE, STAGE, STORAGE, TIMELINE, TRADE } from "@/lib/brand-profile";
import type { BrandData } from "@/lib/brand-data";
import type { Reference } from "@/lib/reference";

const money = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** A brand's profile as brokers see it: who they are, products, footprint, goals and data room. */
export function BrandView({ b, refs }: { b: BrandData; refs: Reference }) {
  const p = b.profile;
  const nameOf = (list: { id: number; name: string }[], ids: number[]) => ids.map((i) => list.find((x) => x.id === i)?.name).filter(Boolean) as string[];
  const stateNames = (codes: string[]) => codes.map((c) => refs.states.find((s) => s.code === c)?.name ?? c);
  const regionNames = p.target_regions.map((r) => refs.regions.find((x) => x.code === r)?.name ?? r);
  const facts = [label(STAGE, p.stage), label(REVENUE, p.annual_revenue_band), p.founded_year ? `Founded ${p.founded_year}` : null, [b.org.hq_city, b.org.hq_state].filter(Boolean).join(", ") || null].filter(Boolean);
  const row = (title: string, values: string[]) => values.length > 0 && (<><dt>{title}</dt><dd>{values.join(", ")}</dd></>);
  const groups = DATA_ROOM_FOLDERS.map((g) => ({ g, rows: b.files.filter((f) => f.folder === g) })).filter((x) => x.rows.length);

  return (
    <div className="bench-stack">
      <section className="bench-section is-cream bench-stack" style={{ gap: 10 }}>
        <div className="bench-row" style={{ gap: 8 }}>
          {[...nameOf(refs.categories, p.categories), ...p.other_categories].map((c) => <span key={c} className="bench-tag is-mist">{c}</span>)}
          {p.certifications.map((c) => <span key={c} className="bench-tag">{label(CERTIFICATIONS, c)}</span>)}
          {p.storage && <span className="bench-tag">{label(STORAGE, p.storage)}</span>}
        </div>
        {facts.length > 0 && <p className="bench-muted" style={{ margin: 0 }}>{facts.join(" · ")}</p>}
        {p.about && <p className="bench-lede" style={{ margin: 0, maxWidth: "48rem", whiteSpace: "pre-line" }}>{p.about}</p>}
        {b.org.website && <a className="bench-link" href={b.org.website} target="_blank" rel="noopener noreferrer">{b.org.website.replace(/^https?:\/\//, "")}</a>}
      </section>

      <div className="bench-grid-2">
        <section className="bench-card bench-stack" aria-labelledby="bv-goal">
          <h2 id="bv-goal" className="bench-eyebrow" style={{ margin: 0 }}>Where they want to be</h2>
          <dl className="bench-dl">
            {row("Retailers", [...nameOf(refs.retailers, p.target_retailers), ...p.other_target_retailers])}
            {row("Distributors", [...nameOf(refs.distributors, p.target_distributors), ...p.other_target_distributors])}
            {row("Channels", [...nameOf(refs.channels, p.target_channels), ...p.other_target_channels])}
            {row("Regions", regionNames)}
            {row("States", stateNames(p.target_states))}
            {p.timeline && (<><dt>Timeline</dt><dd>{label(TIMELINE, p.timeline)}</dd></>)}
            {p.commission_pref && (<><dt>Broker pay</dt><dd>{label(COMMISSION, p.commission_pref)}{p.max_rate != null ? ` · up to ${p.max_rate}%` : ""}{p.max_retainer != null ? ` · up to ${money(p.max_retainer)}/month` : ""}</dd></>)}
            {p.trade_budget_band && (<><dt>Trade budget</dt><dd>{label(TRADE, p.trade_budget_band)}</dd></>)}
          </dl>
          {p.looking_for && <p style={{ margin: 0, whiteSpace: "pre-line" }}>{p.looking_for}</p>}
        </section>
        <section className="bench-card bench-stack" aria-labelledby="bv-now">
          <h2 id="bv-now" className="bench-eyebrow" style={{ margin: 0 }}>Where they sell today</h2>
          <dl className="bench-dl">
            {row("Retailers", [...nameOf(refs.retailers, p.current_retailers), ...p.other_current_retailers])}
            {row("Distributors", [...nameOf(refs.distributors, p.current_distributors), ...p.other_current_distributors])}
            {row("Channels", [...nameOf(refs.channels, p.current_channels), ...p.other_current_channels])}
            {row("States", stateNames(p.current_states))}
            {p.current_doors != null && (<><dt>Stores</dt><dd>{p.current_doors.toLocaleString("en-US")}</dd></>)}
          </dl>
          {!p.current_retailers.length && !p.other_current_retailers.length && !p.other_current_channels.length && !p.current_channels.length && !p.current_distributors.length && !p.other_current_distributors.length && !p.current_states.length && <p className="bench-muted" style={{ margin: 0 }}>Not shared yet.</p>}
        </section>
      </div>

      <section className="bench-section bench-stack" aria-labelledby="bv-prod">
        <h2 id="bv-prod" className="bench-h-section" style={{ fontSize: "1.5rem", margin: 0 }}>Products</h2>
        {b.products.length ? (
          <div className="bench-table-wrap">
            <table className="bench-table">
              <thead><tr><th scope="col">Product</th><th scope="col">Size</th><th scope="col">MSRP</th><th scope="col">Wholesale</th><th scope="col">Case pack</th><th scope="col">Shelf life</th></tr></thead>
              <tbody>
                {b.products.map((x) => (
                  <tr key={x.id}>
                    <td>{x.name}{x.description && <div className="bench-small bench-muted">{x.description}</div>}{x.upc && <div className="bench-small bench-muted">UPC {x.upc}</div>}</td>
                    <td>{x.size ?? "—"}</td><td>{money(x.msrp)}</td><td>{money(x.wholesale)}</td><td>{x.case_pack ?? "—"}</td>
                    <td>{x.shelf_life_days ? `${x.shelf_life_days} days` : "—"}{x.storage && <div className="bench-small bench-muted">{label(STORAGE, x.storage)}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="bench-muted" style={{ margin: 0 }}>No products added yet.</p>}
      </section>

      <section className="bench-section bench-stack" aria-labelledby="bv-files">
        <h2 id="bv-files" className="bench-h-section" style={{ fontSize: "1.5rem", margin: 0 }}>Data room</h2>
        {groups.length ? (
          <div className="bench-grid-3">
            {groups.map(({ g, rows }) => (
              <div key={g} className="bench-card bench-stack" style={{ gap: 8 }}>
                <h3 className="bench-eyebrow" style={{ margin: 0 }}>{g}</h3>
                <ul className="bench-plainlist">{rows.map((f) => <li key={f.id}><BrandFileLink id={f.id} name={f.name} /></li>)}</ul>
              </div>
            ))}
          </div>
        ) : <p className="bench-muted" style={{ margin: 0 }}>No files shared yet.</p>}
      </section>
    </div>
  );
}
