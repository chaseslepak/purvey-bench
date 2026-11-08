import type { Metadata } from "next";
import Link from "next/link";
import { Flash, type FlashParams } from "../Flash";
import { fmtDateTime, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Verification" };

export default async function VerificationQueue({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const show = sp.show === "decided" ? "decided" : "open";
  let q = db.from("verifications")
    .select("id, status, reason, created_at, decided_at, broker_listings!inner(id, completeness, organizations!inner(name)), verification_reviews(references_reached, retailers_confirmed)")
    .order("created_at", { ascending: show === "open" }).limit(200);
  q = show === "open" ? q.eq("status", "requested") : q.neq("status", "requested");
  const { data } = await q;

  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <div className="bench-row">
        <Link className="bench-link" href="/admin/verification" aria-current={show === "open" ? "page" : undefined}>Waiting</Link>
        <span aria-hidden="true">·</span>
        <Link className="bench-link" href="/admin/verification?show=decided" aria-current={show === "decided" ? "page" : undefined}>Decided</Link>
      </div>
      <p className="bench-small bench-muted" style={{ margin: 0 }}>Only Purvey verifies. Reach at least two references and confirm the retailer relationships before verifying.</p>
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Brokerage</th><th scope="col">Requested</th><th scope="col">Checklist</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {(data ?? []).map((v) => {
              const l = v.broker_listings as unknown as { completeness: number; organizations: { name: string } };
              const r = (Array.isArray(v.verification_reviews) ? v.verification_reviews[0] : v.verification_reviews) as { references_reached: boolean; retailers_confirmed: boolean } | null;
              const done = Number(Boolean(r?.references_reached)) + Number(Boolean(r?.retailers_confirmed));
              return (
                <tr key={v.id}>
                  <td><Link className="bench-link" href={`/admin/verification/${v.id}`}>{l.organizations.name}</Link><div className="bench-small bench-muted">Strength {l.completeness}%</div></td>
                  <td>{fmtDateTime(v.created_at)}</td>
                  <td>{done} of 2</td>
                  <td style={{ textTransform: "capitalize" }}>{v.status}{v.reason && <div className="bench-small bench-muted" style={{ textTransform: "none" }}>{v.reason}</div>}</td>
                </tr>
              );
            })}
            {!data?.length && <tr><td colSpan={4} className="bench-muted">{show === "open" ? "Nothing waiting." : "No decisions yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
