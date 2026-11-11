import type { Metadata } from "next";
import Link from "next/link";
import { setRequestStatus } from "../actions";
import { Flash, type FlashParams } from "../Flash";
import { fmtDateTime, PIPELINE, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Requests" };

type Req = { id: string; kind: "placement" | "audit"; status: string; note: string | null; created_at: string; brand: string; broker: string; by: string | null; conversationId?: string };
const LABEL: Record<string, string> = { new: "New", contacted: "Contacted", quoted: "Quoted", won: "Won", lost: "Lost" };

/**
 * Placements and commission audits are Purvey services. Bench only collects
 * the requests; the work and the billing for it happen outside the app.
 */
export default async function AdminRequests({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const [{ data: placements }, { data: audits }] = await Promise.all([
    db.from("placement_requests").select("id, status, note, created_at, organizations!placement_requests_brand_org_id_fkey(name), broker_listings(organizations(name)), users:created_by(name, email)").order("created_at", { ascending: false }).limit(300),
    db.from("audit_requests").select("id, status, note, created_at, conversation_id, organizations:requester_org_id(name, type), users:requested_by(name, email)").order("created_at", { ascending: false }).limit(300),
  ]);
  const rows: Req[] = [
    ...(placements ?? []).map((p) => ({
      id: p.id, kind: "placement" as const, status: p.status, note: p.note, created_at: p.created_at,
      brand: (p.organizations as unknown as { name: string } | null)?.name ?? "—",
      broker: (p.broker_listings as unknown as { organizations: { name: string } } | null)?.organizations.name ?? "—",
      by: (p.users as unknown as { email: string } | null)?.email ?? null,
    })),
    ...(audits ?? []).map((a) => {
      const org = a.organizations as unknown as { name: string; type: string } | null;
      return {
        id: a.id, kind: "audit" as const, status: a.status, note: a.note, created_at: a.created_at, conversationId: a.conversation_id,
        brand: org?.type === "brand" ? org.name : "—", broker: org?.type === "broker" ? org.name : "—",
        by: (a.users as unknown as { email: string } | null)?.email ?? null,
      };
    }),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <div className="bench-row" style={{ justifyContent: "space-between" }}>
        <p className="bench-small bench-muted" style={{ margin: 0 }}>Placement and commission-audit requests. Purvey does this work outside Bench; move each one along as it progresses.</p>
        <a className="bench-link" href="/admin/export?kind=placements">Export CSV</a>
      </div>
      <div className="bench-board" role="list" aria-label="Request pipeline" style={{ gridTemplateColumns: `repeat(${PIPELINE.length}, minmax(200px, 1fr))` }}>
        {PIPELINE.map((stage) => {
          const col = rows.filter((r) => r.status === stage);
          return (
            <div key={stage} className="bench-board_col" role="listitem">
              <h3>{LABEL[stage]} <span>{col.length}</span></h3>
              {col.map((r) => (
                <div key={r.id} className="bench-board_card bench-stack" style={{ gap: 6 }}>
                  <span className="bench-eyebrow" style={{ fontSize: "0.6875rem" }}>{r.kind === "placement" ? "Placement" : "Commission audit"}</span>
                  <b>{r.kind === "placement" ? `${r.brand} → ${r.broker}` : r.brand !== "—" ? `From ${r.brand}` : `From ${r.broker}`}</b>
                  {r.note && <span className="bench-muted">“{r.note.slice(0, 240)}”</span>}
                  <span className="bench-muted">{fmtDateTime(r.created_at)}{r.by ? ` · ${r.by}` : ""}</span>
                  {r.kind === "audit" && <Link className="bench-link" href={`/admin/requests/audit/${r.id}`}>Open commission records</Link>}
                  <form action={setRequestStatus} className="bench-row" style={{ gap: 6 }}>
                    <input type="hidden" name="kind" value={r.kind} /><input type="hidden" name="id" value={r.id} />
                    <label className="bench-sr-only" htmlFor={`st-${r.id}`}>Stage</label>
                    <select id={`st-${r.id}`} name="status" defaultValue={r.status} className="bench-input" style={{ padding: "4px 8px", minHeight: 0, height: 32, fontSize: "0.8125rem", flex: 1 }}>
                      {PIPELINE.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                    </select>
                    <button type="submit" className="bench-link-btn">Move</button>
                  </form>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
