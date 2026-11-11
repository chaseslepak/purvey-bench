import type { Metadata } from "next";
import Link from "next/link";
import { Flash, type FlashParams } from "../Flash";
import { fmtDateTime, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Reports" };

export default async function AdminReports({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const show = sp.show === "closed" ? "closed" : "open";
  let q = db.from("reports")
    .select("id, reason, status, resolution, created_at, resolved_at, conversation_id, listing_id, organizations:reporter_org_id(name, type), broker_listings(organizations(name))")
    .order("created_at", { ascending: show === "open" }).limit(300);
  q = show === "open" ? q.eq("status", "open") : q.neq("status", "open");
  const { data } = await q;

  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <div className="bench-row">
        <Link className="bench-link" href="/admin/reports" aria-current={show === "open" ? "page" : undefined}>Open</Link>
        <span aria-hidden="true">·</span>
        <Link className="bench-link" href="/admin/reports?show=closed" aria-current={show === "closed" ? "page" : undefined}>Closed</Link>
      </div>
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Reported</th><th scope="col">By</th><th scope="col">Reason</th><th scope="col">Filed</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {(data ?? []).map((r) => {
              const by = r.organizations as unknown as { name: string; type: string } | null;
              const listing = (r.broker_listings as unknown as { organizations: { name: string } } | null)?.organizations.name;
              return (
                <tr key={r.id}>
                  <td><Link className="bench-link" href={`/admin/reports/${r.id}`}>{r.conversation_id ? "A conversation" : `Listing: ${listing ?? "—"}`}</Link></td>
                  <td>{by ? `${by.name} (${by.type})` : "—"}</td>
                  <td className="bench-small">{r.reason.slice(0, 200)}</td>
                  <td>{fmtDateTime(r.created_at)}</td>
                  <td style={{ textTransform: "capitalize" }}>{r.status}{r.resolution && <div className="bench-small bench-muted" style={{ textTransform: "none" }}>{r.resolution}</div>}</td>
                </tr>
              );
            })}
            {!data?.length && <tr><td colSpan={5} className="bench-muted">{show === "open" ? "No open reports." : "Nothing closed yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
