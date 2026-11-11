"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { flagReview, respondToReview } from "@/app/brokers/[slug]/review-actions";

/** The broker's public reply to a review, and a private flag to Purvey. */
export function BrokerReviewTools({ reviewId, slug, response, flagged }: { reviewId: string; slug: string; response: string | null; flagged: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "reply" | "flag">("none");
  const [text, setText] = useState(response ?? "");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>, ok: string) => start(async () => {
    const r = await fn();
    if (r.ok) { setMode("none"); setMsg({ ok }); router.refresh(); } else setMsg({ error: r.error });
  });
  return (
    <div className="bench-stack" style={{ gap: 8 }}>
      {mode === "none" && (
        <div className="bench-row" style={{ gap: 14 }}>
          <button type="button" className="bench-link-btn" onClick={() => setMode("reply")}>{response ? "Edit your reply" : "Reply publicly"}</button>
          {flagged ? <span className="bench-small bench-muted">Flagged for Purvey</span> : <button type="button" className="bench-link-btn" onClick={() => setMode("flag")}>Flag for Purvey</button>}
        </div>
      )}
      {mode === "reply" && (
        <form className="bench-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); run(() => respondToReview(reviewId, slug, text), text.trim() ? "Reply posted." : "Reply removed."); }}>
          <label className="bench-label" htmlFor={`reply-${reviewId}`}>Your public reply</label>
          <textarea id={`reply-${reviewId}`} className="bench-input" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: "5rem" }} />
          <div className="bench-row"><button type="submit" className="button is-small w-button" disabled={pending}>Save reply</button><button type="button" className="bench-link-btn" onClick={() => setMode("none")}>Cancel</button></div>
        </form>
      )}
      {mode === "flag" && (
        <form className="bench-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); run(() => flagReview(reviewId, slug, reason), "Flagged. Purvey will take a look."); }}>
          <label className="bench-label" htmlFor={`flag-${reviewId}`}>What&rsquo;s wrong with this review? (only Purvey sees this)</label>
          <input id={`flag-${reviewId}`} className="bench-input" required minLength={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="bench-row"><button type="submit" className="button is-small bench-btn-ghost w-button" disabled={pending}>Send to Purvey</button><button type="button" className="bench-link-btn" onClick={() => setMode("none")}>Cancel</button></div>
        </form>
      )}
      {msg?.error && <p className="bench-notice is-error bench-small" role="alert" style={{ margin: 0 }}>{msg.error}</p>}
      {msg?.ok && <p className="bench-small" role="status" style={{ margin: 0 }}>{msg.ok}</p>}
    </div>
  );
}
