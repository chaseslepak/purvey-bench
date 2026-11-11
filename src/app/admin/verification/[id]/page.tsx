import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decideVerification, saveChecklist, updateReference } from "../../actions";
import { Flash, type FlashParams } from "../../Flash";
import { fmtDateTime, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Verification review" };

const FREQ: Record<string, string> = { weekly: "Weekly", monthly: "Monthly", occasional: "Occasional" };

export default async function VerificationReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: FlashParams }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { db } = await requireAdmin();
  const { data: v } = await db.from("verifications")
    .select("id, status, reason, created_at, decided_at, listing_id, broker_listings!inner(id, about, completeness, verified_at, organizations!inner(name, slug, website))")
    .eq("id", id).maybeSingle();
  if (!v) notFound();
  const l = v.broker_listings as unknown as { id: string; about: string | null; completeness: number; verified_at: string | null; organizations: { name: string; slug: string; website: string | null } };
  const [{ data: review }, { data: refs }, { data: retailers }, { count: states }] = await Promise.all([
    db.from("verification_reviews").select("references_reached, retailers_confirmed, notes, updated_at").eq("verification_id", v.id).maybeSingle(),
    db.from("broker_references").select("id, name, brand, email, phone, status, admin_notes").eq("listing_id", l.id).order("created_at"),
    db.from("broker_retailers").select("call_frequency, custom_name, retailers(name)").eq("listing_id", l.id),
    db.from("broker_states").select("*", { count: "exact", head: true }).eq("listing_id", l.id),
  ]);
  const here = `/admin/verification/${v.id}`;
  const open = v.status === "requested";
  const reached = (refs ?? []).filter((r) => r.status === "reached" || r.status === "confirmed").length;

  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <div>
        <div className="text_title"><Link className="bench-link" href="/admin/verification">Verification</Link></div>
        <h2 className="bench-h-section" style={{ fontSize: "2rem", margin: 0 }}>{l.organizations.name}</h2>
        <p className="bench-small bench-muted" style={{ margin: "6px 0 0" }}>
          Requested {fmtDateTime(v.created_at)} · status <b style={{ textTransform: "capitalize" }}>{v.status}</b>{v.decided_at ? ` on ${fmtDateTime(v.decided_at)}` : ""} ·{" "}
          <Link className="bench-link" href={`/admin/listings/${l.id}`}>Listing admin</Link> · <Link className="bench-link" href={`/brokers/${l.organizations.slug}`} target="_blank">Public profile</Link>
          {l.organizations.website && <> · <a className="bench-link" href={l.organizations.website} target="_blank" rel="noopener noreferrer">Website</a></>}
        </p>
      </div>

      <div className="bench-grid-2">
        <div className="bench-card bench-stack">
          <div className="bench-eyebrow">What they claim</div>
          <p className="bench-small" style={{ margin: 0 }}>{states ?? 0} states · {(retailers ?? []).length} retailers · strength {l.completeness}%</p>
          <ul className="bench-small" style={{ margin: 0, paddingLeft: 18 }}>
            {(retailers ?? []).slice(0, 30).map((r, i) => (
              <li key={i}>{(r.retailers as unknown as { name: string } | null)?.name ?? r.custom_name} · {FREQ[r.call_frequency] ?? r.call_frequency}</li>
            ))}
          </ul>
        </div>
        <div className="bench-card bench-stack">
          <div className="bench-eyebrow">Checklist</div>
          <form action={saveChecklist} className="bench-stack" style={{ gap: 12 }}>
            <input type="hidden" name="verificationId" value={v.id} />
            <label className="bench-row" style={{ gap: 8 }}><input type="checkbox" name="references_reached" defaultChecked={review?.references_reached} disabled={!open} /> At least two references reached ({reached} so far)</label>
            <label className="bench-row" style={{ gap: 8 }}><input type="checkbox" name="retailers_confirmed" defaultChecked={review?.retailers_confirmed} disabled={!open} /> Retailer relationships confirmed</label>
            <div className="bench-field"><label className="bench-label" htmlFor="vn">Working notes (Purvey only)</label><textarea id="vn" name="notes" className="bench-input" defaultValue={review?.notes ?? ""} maxLength={4000} disabled={!open} /></div>
            {open && <div><button type="submit" className="button is-small bench-btn-ghost w-button">Save checklist</button></div>}
          </form>
        </div>
      </div>

      <h3 className="bench-h-section" style={{ fontSize: "1.5rem" }}>References</h3>
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Reference</th><th scope="col">Contact</th><th scope="col">Result</th></tr></thead>
          <tbody>
            {(refs ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.name}<div className="bench-small bench-muted">{r.brand}</div></td>
                <td className="bench-small">{r.email ? <a className="bench-link" href={`mailto:${r.email}`}>{r.email}</a> : "—"}<br />{r.phone ?? ""}</td>
                <td>
                  <form action={updateReference} className="bench-row" style={{ alignItems: "flex-end" }}>
                    <input type="hidden" name="refId" value={r.id} /><input type="hidden" name="back" value={here} />
                    <label className="bench-sr-only" htmlFor={`rs-${r.id}`}>Result for {r.name}</label>
                    <select id={`rs-${r.id}`} name="status" className="bench-input" defaultValue={r.status} style={{ maxWidth: 160 }}>
                      {["pending", "reached", "confirmed", "unreachable"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                    </select>
                    <label className="bench-sr-only" htmlFor={`rn-${r.id}`}>Notes for {r.name}</label>
                    <input id={`rn-${r.id}`} name="notes" className="bench-input" defaultValue={r.admin_notes ?? ""} placeholder="What they said" style={{ maxWidth: 280 }} />
                    <button type="submit" className="bench-link-btn">Save</button>
                  </form>
                </td>
              </tr>
            ))}
            {!refs?.length && <tr><td colSpan={3} className="bench-muted">No references entered.</td></tr>}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="bench-grid-2">
          <form action={decideVerification} className="bench-card bench-stack">
            <div className="bench-eyebrow">Verify</div>
            <input type="hidden" name="verificationId" value={v.id} /><input type="hidden" name="decision" value="verified" />
            <p className="bench-small" style={{ margin: 0 }}>Adds the Verified badge and emails the brokerage. Both checklist items must be ticked and saved.</p>
            <div><button type="submit" className="button is-small w-button" disabled={!(review?.references_reached && review?.retailers_confirmed)}>Verify listing</button></div>
          </form>
          <form action={decideVerification} className="bench-card bench-stack">
            <div className="bench-eyebrow">Reject</div>
            <input type="hidden" name="verificationId" value={v.id} /><input type="hidden" name="decision" value="rejected" />
            <div className="bench-field"><label className="bench-label" htmlFor="rj">Reason (sent to the broker)</label><textarea id="rj" name="reason" className="bench-input" required maxLength={1000} style={{ minHeight: "5rem" }} /></div>
            <div><button type="submit" className="button is-small bench-btn-ghost w-button">Reject request</button></div>
          </form>
        </div>
      ) : v.status === "verified" && l.verified_at ? (
        <form action={decideVerification} className="bench-card bench-stack">
          <div className="bench-eyebrow">Revoke badge</div>
          <input type="hidden" name="verificationId" value={v.id} /><input type="hidden" name="decision" value="revoked" />
          <div className="bench-field"><label className="bench-label" htmlFor="rv">Reason (sent to the broker)</label><textarea id="rv" name="reason" className="bench-input" required maxLength={1000} style={{ minHeight: "5rem" }} /></div>
          <div><button type="submit" className="button is-small bench-btn-ghost w-button">Revoke verification</button></div>
        </form>
      ) : null}
    </section>
  );
}
