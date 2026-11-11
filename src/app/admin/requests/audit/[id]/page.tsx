import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Commission audit" };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type Line = { account?: string; distributor?: string; units?: number; gross?: number; deductions?: number; covered?: boolean };
type Period = { id: string; period: string; status: string; invoice_no: string | null; invoice_date: string | null; paid_date: string | null; lines: Line[]; adjustments: { label: string; amount: number }[]; totals: Record<string, number> | null; questioned_note: string | null };

/**
 * Commission records are private to the two parties. An admin can open them
 * only for a conversation with a commission-audit request, and every open is
 * written to the audit log by admin_read_true_up().
 */
export default async function AuditRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { db } = await requireAdmin();
  const { data: req } = await db.from("audit_requests").select("id, conversation_id, note, status, created_at, organizations:requester_org_id(name)").eq("id", id).maybeSingle();
  if (!req) notFound();
  const { data, error } = await db.rpc("admin_read_true_up", { p_conv: req.conversation_id });
  const periods = (data ?? []) as Period[];

  return (
    <section className="bench-section bench-stack">
      <div>
        <div className="text_title"><Link className="bench-link" href="/admin/requests">Requests</Link></div>
        <h2 className="bench-h-section" style={{ fontSize: "2rem", margin: 0 }}>Commission audit</h2>
        <p className="bench-small bench-muted" style={{ margin: "6px 0 0" }}>
          Requested by {(req.organizations as unknown as { name: string } | null)?.name ?? "—"} on {fmtDate(req.created_at)}{req.note ? `: “${req.note}”` : ""}. This view is recorded in the audit log.
        </p>
      </div>
      {error && <p className="bench-notice is-error" role="alert">Couldn&rsquo;t load the commission records.</p>}
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Month</th><th scope="col">Status</th><th scope="col">Accounts</th><th scope="col">Covered net sales</th><th scope="col">Adjustments</th><th scope="col">Invoiced total</th><th scope="col">Paid</th></tr></thead>
          <tbody>
            {periods.map((p) => {
              const covered = p.lines.filter((l) => l.covered);
              const net = covered.reduce((s, l) => s + (Number(l.gross) || 0) - (Number(l.deductions) || 0), 0);
              const adj = p.adjustments.reduce((s, a) => s + (Number(a.amount) || 0), 0);
              return (
                <tr key={p.id}>
                  <td>{new Date(`${p.period}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</td>
                  <td style={{ textTransform: "capitalize" }}>{p.status.replace(/_/g, " ")}{p.questioned_note && <div className="bench-small bench-muted" style={{ textTransform: "none" }}>Question: {p.questioned_note}</div>}</td>
                  <td>{covered.length} of {p.lines.length} covered</td>
                  <td>{money(net)}</td>
                  <td>{money(adj)}</td>
                  <td>{p.totals ? <>{money(p.totals.total ?? 0)}<div className="bench-small bench-muted">{p.invoice_no}</div></> : "—"}</td>
                  <td>{p.paid_date ? fmtDate(p.paid_date) : "—"}</td>
                </tr>
              );
            })}
            {!periods.length && !error && <tr><td colSpan={7} className="bench-muted">No commission months recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
