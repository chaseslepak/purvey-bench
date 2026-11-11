"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { revealContact, requestPlacement, type Contact } from "@/app/find/actions";

/** Contact details: revealed once per brand (logged); sign-in required; brokers can't reveal. */
export function ContactBlock({ listingId, name, viewer, next }: { listingId: string; name: string; viewer: "anon" | "brand" | "broker"; next: string }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [placement, setPlacement] = useState<"closed" | "open" | "sent">("closed");
  const [note, setNote] = useState("");

  return (
    <div className="bench-card is-white bench-stack">
      <h2 className="bench-eyebrow" style={{ margin: 0 }}>Contact</h2>
      {viewer === "anon" && (
        <>
          <p className="bench-small" style={{ margin: 0 }}>Create a free brand account to see {name}&rsquo;s contact details and message them.</p>
          <Link className="button w-button" href={`/sign-up?role=brand&next=${encodeURIComponent(next)}`}>Create a free account</Link>
          <p className="bench-small" style={{ margin: 0 }}>Already have one? <Link className="bench-link" href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
        </>
      )}
      {viewer === "broker" && <p className="bench-small bench-muted" style={{ margin: 0 }}>Contact details are shared with signed-in brands.</p>}
      {viewer === "brand" && (contact ? (
        <dl className="bench-dl">
          {contact.name && (<><dt>Name</dt><dd>{contact.name}{contact.title ? `, ${contact.title}` : ""}</dd></>)}
          {contact.email && (<><dt>Email</dt><dd><a className="bench-link" href={`mailto:${contact.email}`}>{contact.email}</a></dd></>)}
          {contact.phone && (<><dt>Phone</dt><dd><a className="bench-link" href={`tel:${contact.phone}`}>{contact.phone}</a></dd></>)}
        </dl>
      ) : (
        <button type="button" className="button w-button" disabled={pending}
          onClick={() => start(async () => { const r = await revealContact(listingId); if (r.contact) setContact(r.contact); else setError(r.error ?? "Couldn't load contact details."); })}>
          {pending ? "Loading…" : "Show contact details"}
        </button>
      ))}
      {error && <p className="bench-notice is-warn" role="alert" style={{ margin: 0 }}>{error}</p>}
      {viewer === "brand" && (
        <div className="bench-stack" style={{ gap: 10, borderTop: "1px solid var(--pv-line-soft)", paddingTop: 14 }}>
          {placement === "sent" ? (
            <p className="bench-notice" role="status" style={{ margin: 0 }}>Request sent. The Purvey team will be in touch within one business day.</p>
          ) : placement === "open" ? (
            <form className="bench-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await requestPlacement(listingId, note); if (r.ok) setPlacement("sent"); else setError(r.error ?? null); }); }}>
              <label className="bench-label" htmlFor="placement-note">What should Purvey know?</label>
              <textarea id="placement-note" className="bench-input" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder="Retailers you want, timing, budget…" />
              <div className="bench-row"><button className="button w-button" type="submit" disabled={pending}>Send to Purvey</button><button className="button bench-btn-ghost w-button" type="button" onClick={() => setPlacement("closed")}>Cancel</button></div>
            </form>
          ) : (
            <>
              <button type="button" className="button bench-btn-ghost w-button" onClick={() => setPlacement("open")}>Have Purvey run this placement</button>
              <p className="bench-hint" style={{ margin: 0 }}>Purvey&rsquo;s team manages the broker relationship for you. A Purvey service, quoted separately.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
