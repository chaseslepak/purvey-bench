import type { Metadata } from "next";
import Link from "next/link";
import { setComped } from "../actions";
import { Flash, type FlashParams } from "../Flash";
import { fmtDate, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Listings" };

const STATUSES = ["all", "live", "submitted", "draft", "paused"] as const;

export default async function AdminListings({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const status = STATUSES.find((s) => s === sp.status) ?? "all";
  const q = (sp.q ?? "").trim().slice(0, 80);

  let query = db.from("broker_listings")
    .select("id, org_id, status, admin_paused, verified_at, completeness, live_since, updated_at, organizations!inner(name, slug, suspended_at)")
    .order("updated_at", { ascending: false }).limit(500);
  if (status !== "all") query = query.eq("status", status);
  if (q) query = query.ilike("organizations.name", `%${q.replace(/[%_]/g, "")}%`);
  const [{ data: listings }, { data: subs }] = await Promise.all([query, db.from("subscriptions").select("org_id, status, comped, current_period_end")]);
  const subOf = new Map((subs ?? []).map((s) => [s.org_id as string, s]));
  const here = `/admin/listings?${new URLSearchParams({ ...(status !== "all" ? { status } : {}), ...(q ? { q } : {}) })}`;

  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <form className="bench-row" method="get" role="search">
        <label className="bench-sr-only" htmlFor="lq">Search brokerages</label>
        <input id="lq" name="q" className="bench-input" defaultValue={q} placeholder="Search brokerages" style={{ maxWidth: 280 }} />
        <label className="bench-sr-only" htmlFor="ls">Status</label>
        <select id="ls" name="status" className="bench-input" defaultValue={status} style={{ maxWidth: 180 }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <button type="submit" className="button is-small w-button">Filter</button>
        <a className="bench-link" href="/admin/export?kind=listings" style={{ marginLeft: "auto" }}>Export CSV</a>
      </form>
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Brokerage</th><th scope="col">Status</th><th scope="col">Billing</th><th scope="col">Strength</th><th scope="col">Updated</th><th scope="col"><span className="bench-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {(listings ?? []).map((l) => {
              const o = l.organizations as unknown as { name: string; slug: string; suspended_at: string | null };
              const sub = subOf.get(l.org_id);
              return (
                <tr key={l.id}>
                  <td>
                    <Link className="bench-link" href={`/admin/listings/${l.id}`}>{o.name}</Link>
                    {l.verified_at && <span className="bench-tag is-mist" style={{ marginLeft: 8 }}>Verified</span>}
                  </td>
                  <td>
                    {l.admin_paused ? "Paused by Purvey" : l.status === "paused" ? "Paused (billing)" : l.status[0].toUpperCase() + l.status.slice(1)}
                    {o.suspended_at && <div className="bench-small bench-muted">Org suspended</div>}
                  </td>
                  <td>{sub?.comped ? "Comped" : sub?.status ?? "None"}{sub?.current_period_end && !sub.comped && <div className="bench-small bench-muted">Renews {fmtDate(sub.current_period_end)}</div>}</td>
                  <td>{l.completeness}%</td>
                  <td>{fmtDate(l.updated_at)}</td>
                  <td>
                    <form action={setComped}>
                      <input type="hidden" name="orgId" value={l.org_id} />
                      <input type="hidden" name="comped" value={sub?.comped ? "0" : "1"} />
                      <input type="hidden" name="back" value={here} />
                      <button type="submit" className="bench-link-btn">{sub?.comped ? "Remove comp" : "Comp"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!listings?.length && <tr><td colSpan={6} className="bench-muted">No listings match.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
