import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveReport } from "../../actions";
import { Flash, type FlashParams } from "../../Flash";
import { fmtDateTime, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Report" };

type Msg = { id: string; sender_org_id: string; body: string; created_at: string; is_auto_reply: boolean };

export default async function AdminReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: FlashParams }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { db } = await requireAdmin();
  const { data: r } = await db.from("reports")
    .select("id, reason, status, resolution, created_at, resolved_at, conversation_id, listing_id, reporter_org_id, organizations:reporter_org_id(name, type), users:reporter_user_id(name, email), broker_listings(id, organizations(name))")
    .eq("id", id).maybeSingle();
  if (!r) notFound();
  const by = r.organizations as unknown as { name: string; type: string } | null;
  const reporter = r.users as unknown as { name: string | null; email: string } | null;
  const listing = r.broker_listings as unknown as { id: string; organizations: { name: string } } | null;

  // The conversation's two parties (conversations are readable by admins once reported).
  let parties: { brand: { id: string; name: string }; broker: { id: string; name: string } } | null = null;
  if (r.conversation_id) {
    const { data: c } = await db.from("conversations").select("brand_org_id, broker_org_id, brand:organizations!conversations_brand_org_id_fkey(name), broker:organizations!conversations_broker_org_id_fkey(name)").eq("id", r.conversation_id).maybeSingle();
    if (c) parties = {
      brand: { id: c.brand_org_id, name: (c.brand as unknown as { name: string } | null)?.name ?? "Brand" },
      broker: { id: c.broker_org_id, name: (c.broker as unknown as { name: string } | null)?.name ?? "Broker" },
    };
  }
  const reported = parties ? (parties.brand.id === r.reporter_org_id ? parties.broker : parties.brand) : listing ? { id: "", name: listing.organizations.name } : null;

  // Reading the thread is an explicit, audited step.
  let messages: Msg[] | null = null;
  if (r.conversation_id && sp.read === "1") {
    const { data } = await db.rpc("admin_read_thread", { p_conv: r.conversation_id });
    messages = (data ?? []) as Msg[];
  }
  const nameOf = (org: string) => (parties ? (org === parties.brand.id ? parties.brand.name : parties.broker.name) : "—");
  const open = r.status === "open";

  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <div>
        <div className="text_title"><Link className="bench-link" href="/admin/reports">Reports</Link></div>
        <h2 className="bench-h-section" style={{ fontSize: "2rem", margin: 0 }}>Report about {reported?.name ?? "—"}</h2>
        <p className="bench-small bench-muted" style={{ margin: "6px 0 0" }}>
          Filed {fmtDateTime(r.created_at)} by {reporter?.name ?? reporter?.email ?? "—"}{by ? ` (${by.name}, ${by.type})` : ""}
          {listing && <> · <Link className="bench-link" href={`/admin/listings/${listing.id}`}>Listing admin</Link></>}
        </p>
      </div>
      <blockquote className="bench-card" style={{ margin: 0 }}>{r.reason}</blockquote>

      {r.conversation_id && (
        messages ? (
          <div className="bench-card is-white bench-stack" style={{ gap: 10 }}>
            <div className="bench-eyebrow">Thread · this read was recorded in the audit log</div>
            {messages.map((m) => (
              <div key={m.id} className="bench-small">
                <b>{nameOf(m.sender_org_id)}</b>{m.is_auto_reply ? " (auto-reply)" : ""} · <span className="bench-muted">{fmtDateTime(m.created_at)}</span>
                <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="bench-small" style={{ margin: 0 }}>
            <Link className="button is-small bench-btn-ghost w-button" href={`/admin/reports/${r.id}?read=1`}>Read the conversation</Link>{" "}
            <span className="bench-muted">Opening it writes an entry to the audit log.</span>
          </p>
        )
      )}

      {open ? (
        <form action={resolveReport} className="bench-card bench-stack">
          <div className="bench-eyebrow">Resolve</div>
          <input type="hidden" name="reportId" value={r.id} />
          <fieldset className="bench-stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
            <legend className="bench-label" style={{ marginBottom: 8 }}>Action on {reported?.name ?? "the reported party"}</legend>
            <label className="bench-row" style={{ gap: 8 }}><input type="radio" name="action" value="none" defaultChecked /> No action</label>
            <label className="bench-row" style={{ gap: 8 }}><input type="radio" name="action" value="warn" /> Email a warning to their owners</label>
            {r.conversation_id && <label className="bench-row" style={{ gap: 8 }}><input type="radio" name="action" value="block" /> Block them from messaging {by?.name ?? "the reporter"}</label>}
            {(listing || parties) && <label className="bench-row" style={{ gap: 8 }}><input type="radio" name="action" value="pause" /> Pause their listing (brokers only)</label>}
            <label className="bench-row" style={{ gap: 8 }}><input type="radio" name="action" value="suspend" /> Suspend the organization</label>
          </fieldset>
          <div className="bench-field"><label className="bench-label" htmlFor="wm">Warning or pause reason (sent to them)</label><textarea id="wm" name="message" className="bench-input" maxLength={2000} style={{ minHeight: "5rem" }} /></div>
          <div className="bench-field"><label className="bench-label" htmlFor="rs">Resolution note (Purvey only)</label><input id="rs" name="resolution" className="bench-input" maxLength={2000} /></div>
          <div className="bench-row">
            <button type="submit" name="status" value="resolved" className="button is-small w-button">Resolve</button>
            <button type="submit" name="status" value="dismissed" className="button is-small bench-btn-ghost w-button">Dismiss</button>
          </div>
        </form>
      ) : (
        <p className="bench-notice" role="status" style={{ margin: 0 }}>
          {r.status === "dismissed" ? "Dismissed" : "Resolved"} {fmtDateTime(r.resolved_at)}{r.resolution ? `: ${r.resolution}` : "."}
        </p>
      )}
    </section>
  );
}
