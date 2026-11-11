"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StarInput } from "./StarInput";
import { deleteReview, submitReview } from "@/app/brokers/[slug]/review-actions";

export type MyReview = { rating: number; title: string | null; body: string; showName: boolean } | null;

/** A brand's review of a broker (one per brand, editable), plus an optional Purvey-only reference. */
export function ReviewForm({ listingId, slug, brokerName, brandName, existing, referenceGiven }: {
  listingId: string; slug: string; brokerName: string; brandName: string; existing: MyReview; referenceGiven: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!existing);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [showName, setShowName] = useState(existing?.showName ?? false);
  const [refOn, setRefOn] = useState(false);
  const [ref, setRef] = useState({ name: "", email: "", phone: "", note: "" });
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="bench-card bench-stack" style={{ gap: 10 }}>
        <p style={{ margin: 0 }}>{msg?.ok ?? "You've reviewed this broker."} You can change or remove your review at any time.</p>
        <div className="bench-row">
          <button type="button" className="button is-small bench-btn-ghost w-button" onClick={() => { setMsg(null); setOpen(true); }}>Edit your review</button>
          <button type="button" className="bench-link-btn" disabled={pending} onClick={() => start(async () => {
            if (!confirm("Remove your review?")) return;
            const r = await deleteReview(listingId, slug);
            if (r.ok) { setRating(0); setTitle(""); setBody(""); setOpen(true); setMsg({ ok: "Review removed." }); router.refresh(); } else setMsg({ error: r.error });
          })}>Remove</button>
        </div>
      </div>
    );
  }

  return (
    <form className="bench-card is-white bench-form" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await submitReview(listingId, slug, { rating, title, body, showName, reference: refOn ? ref : null });
        if (r.ok) { setOpen(false); setMsg({ ok: refOn ? "Thanks. Your review is live and Purvey has your reference." : "Thanks. Your review is live." }); setRefOn(false); router.refresh(); }
        else setMsg({ error: r.error });
      });
    }}>
      <h3 className="bench-eyebrow" style={{ margin: 0 }}>{existing ? "Edit your review" : `Review ${brokerName}`}</h3>
      <StarInput name="rating" value={rating} onChange={setRating} />
      <div className="bench-field"><label className="bench-label" htmlFor="rv-title">Headline <span className="bench-muted">(optional)</span></label><input id="rv-title" className="bench-input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Got us into Jewel in two months" /></div>
      <div className="bench-field">
        <label className="bench-label" htmlFor="rv-body">Your review</label>
        <textarea id="rv-body" className="bench-input" required minLength={20} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did they do for you? Which retailers, how responsive, would you work with them again?" />
      </div>
      <label className="bench-row" style={{ gap: 8 }}><input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> Show {brandName} as the author (otherwise it shows as &ldquo;Brand on Bench&rdquo;)</label>
      {!referenceGiven && (
        <label className="bench-row" style={{ gap: 8 }}><input type="checkbox" checked={refOn} onChange={(e) => setRefOn(e.target.checked)} /> I&rsquo;m willing to be a reference for {brokerName} <span className="bench-muted">(seen only by Purvey)</span></label>
      )}
      {refOn && (
        <div className="bench-stack" style={{ gap: 12 }}>
          <p className="bench-small bench-muted" style={{ margin: 0 }}>Purvey may contact this person when verifying {brokerName}. Brokers and other brands never see it.</p>
          <div className="bench-grid-2">
            <div className="bench-field"><label className="bench-label" htmlFor="rf-name">Contact name</label><input id="rf-name" className="bench-input" required maxLength={120} value={ref.name} onChange={(e) => setRef({ ...ref, name: e.target.value })} autoComplete="name" /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="rf-email">Email</label><input id="rf-email" type="email" className="bench-input" value={ref.email} onChange={(e) => setRef({ ...ref, email: e.target.value })} autoComplete="email" /></div>
          </div>
          <div className="bench-field"><label className="bench-label" htmlFor="rf-phone">Phone <span className="bench-muted">(optional)</span></label><input id="rf-phone" type="tel" className="bench-input" maxLength={40} value={ref.phone} onChange={(e) => setRef({ ...ref, phone: e.target.value })} autoComplete="tel" /></div>
          <div className="bench-field"><label className="bench-label" htmlFor="rf-note">Note for Purvey <span className="bench-muted">(optional)</span></label><input id="rf-note" className="bench-input" maxLength={2000} value={ref.note} onChange={(e) => setRef({ ...ref, note: e.target.value })} /></div>
        </div>
      )}
      {msg?.error && <p className="bench-notice is-error" role="alert" style={{ margin: 0 }}>{msg.error}</p>}
      {msg?.ok && <p className="bench-notice" role="status" style={{ margin: 0 }}>{msg.ok}</p>}
      <div className="bench-row">
        <button type="submit" className="button is-small w-button" disabled={pending || !rating}>{existing ? "Save changes" : "Post review"}</button>
        {existing && <button type="button" className="bench-link-btn" onClick={() => setOpen(false)}>Cancel</button>}
      </div>
    </form>
  );
}
