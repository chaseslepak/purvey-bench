import type { Metadata } from "next";
import Link from "next/link";
import { setReviewHidden } from "../actions";
import { Flash, type FlashParams } from "../Flash";
import { Stars } from "@/components/reviews/Stars";
import { fmtDateTime, requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Reviews" };

/** Moderation: flagged reviews first. Hiding takes a review off the profile and out of the average. */
export default async function AdminReviews({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const show = sp.show === "hidden" ? "hidden" : sp.show === "all" ? "all" : "flagged";
  let q = db.from("broker_reviews")
    .select("id, rating, title, body, show_brand_name, flagged_at, flag_reason, hidden_at, hidden_reason, response, created_at, listing_id, brand:organizations!broker_reviews_brand_org_id_fkey(name), broker_listings(id, organizations(name, slug))")
    .order("created_at", { ascending: false }).limit(300);
  if (show === "flagged") q = q.not("flagged_at", "is", null);
  if (show === "hidden") q = q.not("hidden_at", "is", null);
  const { data } = await q;
  const tab = (k: string, label: string) => <Link className="bench-link" href={k === "flagged" ? "/admin/reviews" : `/admin/reviews?show=${k}`} aria-current={show === k ? "page" : undefined} style={show === k ? { fontWeight: 600 } : undefined}>{label}</Link>;

  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <div className="bench-row">{tab("flagged", "Flagged")}<span aria-hidden="true">·</span>{tab("all", "All")}<span aria-hidden="true">·</span>{tab("hidden", "Hidden")}</div>
      <p className="bench-small bench-muted" style={{ margin: 0 }}>Only brands a broker has replied to on Bench can review. You see the brand behind every review; the public sees it only if the brand chose to show its name.</p>
      <ul className="bench-reviews">
        {(data ?? []).map((r) => {
          const broker = (r.broker_listings as unknown as { id: string; organizations: { name: string; slug: string } } | null);
          const brand = (r.brand as unknown as { name: string } | null)?.name ?? "—";
          return (
            <li key={r.id} className="bench-review">
              <div className="bench-row" style={{ justifyContent: "space-between" }}>
                <span><Stars value={r.rating} label={`${r.rating} out of 5 stars`} /> <b style={{ marginLeft: 8 }}>{broker ? <Link className="bench-link" href={`/admin/listings/${broker.id}`}>{broker.organizations.name}</Link> : "—"}</b></span>
                <span className="bench-small bench-muted">by {brand}{r.show_brand_name ? " (name shown)" : " (anonymous)"} · {fmtDateTime(r.created_at)}</span>
              </div>
              {r.title && <h3 className="bench-review_title">{r.title}</h3>}
              <p style={{ margin: 0, whiteSpace: "pre-line" }}>{r.body}</p>
              {r.response && <div className="bench-review_reply"><div className="bench-small" style={{ fontWeight: 600 }}>Broker reply</div><p style={{ margin: 0 }}>{r.response}</p></div>}
              {r.flagged_at && <p className="bench-notice is-warn bench-small" style={{ margin: 0 }}>Flagged by the broker {fmtDateTime(r.flagged_at)}: {r.flag_reason}</p>}
              {r.hidden_at && <p className="bench-notice bench-small" style={{ margin: 0 }}>Hidden {fmtDateTime(r.hidden_at)}{r.hidden_reason ? `: ${r.hidden_reason}` : ""}</p>}
              <form action={setReviewHidden} className="bench-row" style={{ alignItems: "flex-end" }}>
                <input type="hidden" name="reviewId" value={r.id} /><input type="hidden" name="hidden" value={r.hidden_at ? "0" : "1"} />
                <input type="hidden" name="back" value={show === "flagged" ? "/admin/reviews" : `/admin/reviews?show=${show}`} />
                {!r.hidden_at && (<><label className="bench-sr-only" htmlFor={`hr-${r.id}`}>Reason for hiding</label><input id={`hr-${r.id}`} name="reason" className="bench-input" placeholder="Reason (kept in the audit log)" style={{ maxWidth: 320 }} /></>)}
                <button type="submit" className="bench-link-btn">{r.hidden_at ? "Restore" : "Hide review"}</button>
                {r.flagged_at && !r.hidden_at && <button type="submit" name="hidden" value="0" className="bench-link-btn">Keep it, clear the flag</button>}
              </form>
            </li>
          );
        })}
        {!data?.length && <li className="bench-muted">{show === "flagged" ? "No flagged reviews." : "No reviews."}</li>}
      </ul>
    </section>
  );
}
