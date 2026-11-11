import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editListing, setComped, setPaused, setSuspended, updateReference } from "../../actions";
import { BrandRefs } from "../../BrandRefs";
import { Flash, type FlashParams } from "../../Flash";
import { fmtDate, fmtDateTime, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Listing" };

export default async function AdminListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: FlashParams }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { db } = await requireAdmin();
  const { data: l } = await db.from("broker_listings")
    .select("id, org_id, about, status, admin_paused, admin_pause_reason, verified_at, completeness, live_since, submitted_at, organizations!inner(id, name, slug, hq_city, hq_state, website, suspended_at, created_at)")
    .eq("id", id).maybeSingle();
  if (!l) notFound();
  const o = l.organizations as unknown as { id: string; name: string; slug: string; hq_city: string | null; hq_state: string | null; website: string | null; suspended_at: string | null; created_at: string };
  const [{ data: sub }, { data: refs }, { data: contacts }, { data: verifs }, { data: members }] = await Promise.all([
    db.from("subscriptions").select("status, comped, current_period_end, cancel_at_period_end, past_due_since, stripe_customer_id").eq("org_id", l.org_id).maybeSingle(),
    db.from("broker_references").select("id, name, brand, email, phone, status, admin_notes").eq("listing_id", l.id).order("created_at"),
    db.from("broker_contacts").select("name, title, email, phone").eq("listing_id", l.id),
    db.from("verifications").select("id, status, reason, created_at, decided_at").eq("listing_id", l.id).order("created_at", { ascending: false }),
    db.from("org_members").select("role, users!org_members_user_id_fkey(name, email)").eq("org_id", l.org_id),
  ]);
  const here = `/admin/listings/${l.id}`;
  const state = l.admin_paused ? "Paused by Purvey" : l.status === "paused" ? "Paused (billing)" : l.status[0].toUpperCase() + l.status.slice(1);

  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <div className="bench-row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="text_title"><Link className="bench-link" href="/admin/listings">Listings</Link></div>
          <h2 className="bench-h-section" style={{ fontSize: "2rem", margin: 0 }}>{o.name}</h2>
          <div className="bench-row" style={{ marginTop: 8 }}>
            <span className={`bench-tag${l.status === "live" && !l.admin_paused ? " is-blue" : ""}`}>{state}</span>
            {l.verified_at && <span className="bench-tag is-mist">Verified {fmtDate(l.verified_at)}</span>}
            {o.suspended_at && <span className="bench-tag">Suspended</span>}
            <span className="bench-small bench-muted">Strength {l.completeness}%</span>
          </div>
        </div>
        <Link className="button bench-btn-ghost w-button" href={`/brokers/${o.slug}`} target="_blank">View as a brand sees it</Link>
      </div>

      <div className="bench-grid-2">
        <div className="bench-card bench-stack">
          <div className="bench-eyebrow">Billing</div>
          <p style={{ margin: 0 }}>
            {sub?.comped ? "Comped: listed free." : sub?.status ? `Stripe: ${sub.status}${sub.cancel_at_period_end ? " (cancels at period end)" : ""}` : "No subscription."}
            {sub?.current_period_end && !sub.comped && <><br /><span className="bench-small bench-muted">Period ends {fmtDate(sub.current_period_end)}</span></>}
            {sub?.past_due_since && <><br /><span className="bench-small bench-muted">Past due since {fmtDate(sub.past_due_since)}</span></>}
          </p>
          <form action={setComped}>
            <input type="hidden" name="orgId" value={l.org_id} /><input type="hidden" name="comped" value={sub?.comped ? "0" : "1"} /><input type="hidden" name="back" value={here} />
            <button type="submit" className="button is-small bench-btn-ghost w-button">{sub?.comped ? "Remove comp" : "Comp this listing"}</button>
          </form>
        </div>
        <div className="bench-card bench-stack">
          <div className="bench-eyebrow">Visibility</div>
          {l.admin_paused ? (
            <form action={setPaused} className="bench-stack" style={{ gap: 10 }}>
              <p style={{ margin: 0 }}>Paused: {l.admin_pause_reason ?? "no reason recorded"}</p>
              <input type="hidden" name="listingId" value={l.id} /><input type="hidden" name="paused" value="0" /><input type="hidden" name="back" value={here} />
              <button type="submit" className="button is-small w-button">Unpause</button>
            </form>
          ) : (
            <form action={setPaused} className="bench-stack" style={{ gap: 10 }}>
              <input type="hidden" name="listingId" value={l.id} /><input type="hidden" name="paused" value="1" /><input type="hidden" name="back" value={here} />
              <div className="bench-field"><label className="bench-label" htmlFor="pr">Reason (sent to the broker)</label><input id="pr" name="reason" className="bench-input" maxLength={500} required /></div>
              <button type="submit" className="button is-small bench-btn-ghost w-button">Pause listing</button>
            </form>
          )}
          <form action={setSuspended}>
            <input type="hidden" name="orgId" value={l.org_id} /><input type="hidden" name="suspended" value={o.suspended_at ? "0" : "1"} /><input type="hidden" name="back" value={here} />
            <button type="submit" className="bench-link-btn">{o.suspended_at ? "Lift suspension" : "Suspend this brokerage"}</button>
          </form>
        </div>
      </div>

      <div className="bench-card is-white bench-stack">
        <h3 className="bench-eyebrow" style={{ margin: 0 }}>Edit listing</h3>
        <form action={editListing} className="bench-form">
          <input type="hidden" name="listingId" value={l.id} /><input type="hidden" name="orgId" value={l.org_id} />
          <div className="bench-field"><label className="bench-label" htmlFor="e-name">Brokerage name</label><input id="e-name" name="name" className="bench-input" defaultValue={o.name} required maxLength={120} /></div>
          <div className="bench-grid-2">
            <div className="bench-field"><label className="bench-label" htmlFor="e-city">HQ city</label><input id="e-city" name="hq_city" className="bench-input" defaultValue={o.hq_city ?? ""} maxLength={80} /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="e-state">HQ state</label><input id="e-state" name="hq_state" className="bench-input" defaultValue={o.hq_state ?? ""} maxLength={2} /></div>
          </div>
          <div className="bench-field"><label className="bench-label" htmlFor="e-about">About</label><textarea id="e-about" name="about" className="bench-input" defaultValue={l.about ?? ""} maxLength={2000} /></div>
          <div><button type="submit" className="button is-small w-button">Save changes</button></div>
        </form>
      </div>

      <h3 className="bench-h-section" style={{ fontSize: "1.5rem" }}>References <span className="bench-small bench-muted">(Purvey only)</span></h3>
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Reference</th><th scope="col">Contact</th><th scope="col">Check</th></tr></thead>
          <tbody>
            {(refs ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.name}<div className="bench-small bench-muted">{r.brand}</div></td>
                <td className="bench-small">{r.email ?? "—"}<br />{r.phone ?? ""}</td>
                <td>
                  <form action={updateReference} className="bench-row" style={{ alignItems: "flex-end" }}>
                    <input type="hidden" name="refId" value={r.id} /><input type="hidden" name="back" value={here} />
                    <label className="bench-sr-only" htmlFor={`rs-${r.id}`}>Status for {r.name}</label>
                    <select id={`rs-${r.id}`} name="status" className="bench-input" defaultValue={r.status} style={{ maxWidth: 160 }}>
                      {["pending", "reached", "confirmed", "unreachable"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                    </select>
                    <label className="bench-sr-only" htmlFor={`rn-${r.id}`}>Notes for {r.name}</label>
                    <input id={`rn-${r.id}`} name="notes" className="bench-input" defaultValue={r.admin_notes ?? ""} placeholder="Notes" style={{ maxWidth: 260 }} />
                    <button type="submit" className="bench-link-btn">Save</button>
                  </form>
                </td>
              </tr>
            ))}
            {!refs?.length && <tr><td colSpan={3} className="bench-muted">No references entered.</td></tr>}
          </tbody>
        </table>
      </div>

      <BrandRefs db={db} listingId={l.id} back={here} />

      <div className="bench-grid-2">
        <div className="bench-stack" style={{ gap: 8 }}>
          <h3 className="bench-eyebrow">Contacts</h3>
          {(contacts ?? []).map((c) => <p key={c.email} className="bench-small" style={{ margin: 0 }}>{c.name}{c.title ? `, ${c.title}` : ""} · {c.email}{c.phone ? ` · ${c.phone}` : ""}</p>)}
          <h3 className="bench-eyebrow" style={{ marginTop: 12 }}>Team</h3>
          {(members ?? []).map((m, i) => { const u = m.users as unknown as { name: string | null; email: string }; return <p key={i} className="bench-small" style={{ margin: 0 }}>{u?.name ?? "—"} · {u?.email} · {m.role}</p>; })}
        </div>
        <div className="bench-stack" style={{ gap: 8 }}>
          <h3 className="bench-eyebrow">Verification history</h3>
          {(verifs ?? []).map((v) => (
            <p key={v.id} className="bench-small" style={{ margin: 0 }}>
              <Link className="bench-link" href={`/admin/verification/${v.id}`}>{v.status}</Link> · requested {fmtDateTime(v.created_at)}{v.decided_at ? ` · decided ${fmtDateTime(v.decided_at)}` : ""}{v.reason ? ` · ${v.reason}` : ""}
            </p>
          ))}
          {!verifs?.length && <p className="bench-small bench-muted" style={{ margin: 0 }}>Never requested.</p>}
          <p className="bench-small bench-muted" style={{ margin: "12px 0 0" }}>Joined {fmtDate(o.created_at)} · submitted {fmtDate(l.submitted_at)} · live since {fmtDate(l.live_since)}</p>
        </div>
      </div>
    </section>
  );
}
