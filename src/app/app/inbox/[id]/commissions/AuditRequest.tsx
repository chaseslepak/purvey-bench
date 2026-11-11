"use client";
import { useState, useTransition } from "react";
import { requestCommissionAudit } from "../deal-actions";

/** Commission audits are a Purvey service; this only sends the request. */
export function AuditRequest({ id, existing }: { id: string; existing: { status: string; created_at: string } | null }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [pending, start] = useTransition();
  if (existing || msg?.ok) {
    return (
      <p className="bench-notice" role="status" style={{ margin: 0 }}>
        {msg?.ok ? "Request sent. Purvey will be in touch about a commission audit." : `You asked Purvey for a commission audit on ${new Date(existing!.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}. Status: ${existing!.status}.`}
      </p>
    );
  }
  return (
    <div className="bench-card bench-stack" style={{ gap: 10 }}>
      <div className="bench-eyebrow">Need a second set of eyes?</div>
      <p className="bench-small" style={{ margin: 0 }}>Purvey can audit commissions against your distributor reports. It&rsquo;s a separate Purvey service; we&rsquo;ll reach out with scope and pricing. Requesting lets Purvey view this deal&rsquo;s commission records.</p>
      {open ? (
        <form className="bench-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); start(async () => setMsg(await requestCommissionAudit(id, note))); }}>
          <div className="bench-field"><label className="bench-label" htmlFor="audit-note">What should we look at? (optional)</label><textarea id="audit-note" className="bench-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} style={{ minHeight: "5rem" }} /></div>
          {msg?.error && <p className="bench-notice is-error" role="alert" style={{ margin: 0 }}>{msg.error}</p>}
          <div className="bench-row"><button type="submit" className="button is-small w-button" disabled={pending}>Send request</button><button type="button" className="bench-link-btn" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      ) : (
        <div><button type="button" className="button is-small bench-btn-ghost w-button" onClick={() => setOpen(true)}>Have Purvey audit commissions</button></div>
      )}
    </div>
  );
}
