import type { Metadata } from "next";
import { setSuspended } from "../actions";
import { Flash, type FlashParams } from "../Flash";
import { fmtDate, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Brands" };

export default async function AdminBrands({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const q = (sp.q ?? "").trim().slice(0, 80).replace(/[%_]/g, "");
  let query = db.from("organizations").select("id, name, website, created_at, suspended_at, org_members(role, users!org_members_user_id_fkey(name, email))").eq("type", "brand").order("created_at", { ascending: false }).limit(500);
  if (q) query = query.ilike("name", `%${q}%`);
  const [{ data: brands }, { data: placements }] = await Promise.all([query, db.from("placement_requests").select("brand_org_id")]);
  const placementCount = new Map<string, number>();
  for (const p of placements ?? []) placementCount.set(p.brand_org_id, (placementCount.get(p.brand_org_id) ?? 0) + 1);
  const here = `/admin/brands${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <form className="bench-row" method="get" role="search">
        <label className="bench-sr-only" htmlFor="bq">Search brands</label>
        <input id="bq" name="q" className="bench-input" defaultValue={q} placeholder="Search brands" style={{ maxWidth: 280 }} />
        <button type="submit" className="button is-small w-button">Search</button>
        <a className="bench-link" href="/admin/export?kind=brands" style={{ marginLeft: "auto" }}>Export CSV</a>
      </form>
      <p className="bench-small bench-muted" style={{ margin: 0 }}>Brands are free and never listed. Briefs stay private to each brand&rsquo;s team, so they aren&rsquo;t shown here.</p>
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Brand</th><th scope="col">Owner</th><th scope="col">Team</th><th scope="col">Placement requests</th><th scope="col">Joined</th><th scope="col"><span className="bench-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {(brands ?? []).map((b) => {
              const members = (b.org_members ?? []) as unknown as { role: string; users: { name: string | null; email: string } | null }[];
              const owner = members.find((m) => m.role === "owner")?.users;
              return (
                <tr key={b.id}>
                  <td>{b.name}{b.suspended_at && <div className="bench-small bench-muted">Suspended {fmtDate(b.suspended_at)}</div>}{b.website && <div className="bench-small"><a className="bench-link" href={b.website} target="_blank" rel="noopener noreferrer">{b.website.replace(/^https?:\/\//, "")}</a></div>}</td>
                  <td className="bench-small">{owner?.name ?? "—"}<br />{owner?.email}</td>
                  <td>{members.length}</td>
                  <td>{placementCount.get(b.id) ?? 0}</td>
                  <td>{fmtDate(b.created_at)}</td>
                  <td>
                    <form action={setSuspended}>
                      <input type="hidden" name="orgId" value={b.id} /><input type="hidden" name="suspended" value={b.suspended_at ? "0" : "1"} /><input type="hidden" name="back" value={here} />
                      <button type="submit" className="bench-link-btn">{b.suspended_at ? "Lift suspension" : "Suspend"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!brands?.length && <tr><td colSpan={6} className="bench-muted">No brands yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
