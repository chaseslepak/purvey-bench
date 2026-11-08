import type { Metadata } from "next";
import { fmtDateTime, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 100;

export default async function AuditLog({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const page = Math.max(1, Math.min(1000, Number(sp.page) || 1));
  const action = (sp.action ?? "").trim().slice(0, 60).replace(/[%_]/g, "");
  let q = db.from("audit_log").select("id, actor_user_id, action, target_type, target_id, details, created_at, actor_email", { count: "exact" })
    .order("id", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (action) q = q.ilike("action", `${action}%`);
  const { data, count } = await q;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number) => `/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), page: String(p) })}`;

  return (
    <section className="bench-section bench-stack">
      <form className="bench-row" method="get" role="search">
        <label className="bench-sr-only" htmlFor="aa">Filter by action</label>
        <input id="aa" name="action" className="bench-input" defaultValue={action} placeholder="Action starts with, e.g. listing." style={{ maxWidth: 300 }} />
        <button type="submit" className="button is-small w-button">Filter</button>
        <a className="bench-link" href={`/admin/export?kind=audit${action ? `&action=${encodeURIComponent(action)}` : ""}`} style={{ marginLeft: "auto" }}>Export CSV</a>
      </form>
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Details</th></tr></thead>
          <tbody>
            {(data ?? []).map((e) => {
              const details = e.details && Object.keys(e.details).length ? JSON.stringify(e.details) : "";
              return (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(e.created_at)}</td>
                  <td className="bench-small">{e.actor_email ?? (e.actor_user_id ? "Deleted user" : "System")}</td>
                  <td><code>{e.action}</code></td>
                  <td className="bench-small">{e.target_type}<div className="bench-muted" style={{ wordBreak: "break-all" }}>{e.target_id}</div></td>
                  <td className="bench-small" style={{ wordBreak: "break-word", maxWidth: 360 }}>{details.slice(0, 300)}</td>
                </tr>
              );
            })}
            {!data?.length && <tr><td colSpan={5} className="bench-muted">No entries.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="bench-row" aria-label="Audit log pages">
          {page > 1 && <a className="bench-link" href={link(page - 1)}>Newer</a>}
          <span className="bench-small bench-muted">Page {page} of {pages}</span>
          {page < pages && <a className="bench-link" href={link(page + 1)}>Older</a>}
        </nav>
      )}
    </section>
  );
}
