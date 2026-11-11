import { BrokerReviewTools } from "./BrokerReviewTools";
import { Stars } from "./Stars";

export type PublicReview = {
  id: string; rating: number; title: string | null; body: string; author: string; created_at: string; updated_at: string;
  response: string | null; response_at: string | null; mine: boolean; flagged: boolean;
};
const day = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });

/** Reviews as the public sees them; the broker's own view adds reply and flag. */
export function ReviewList({ reviews, brokerName, slug, ownListing }: { reviews: PublicReview[]; brokerName: string; slug: string; ownListing: boolean }) {
  return (
    <ul className="bench-reviews">
      {reviews.map((r) => (
        <li key={r.id} className="bench-review">
          <div className="bench-row" style={{ gap: 10, justifyContent: "space-between" }}>
            <Stars value={r.rating} label={`${r.rating} out of 5 stars`} />
            <span className="bench-small bench-muted">{r.author}{r.mine ? " (your brand)" : ""} · {day(r.created_at)}</span>
          </div>
          {r.title && <h3 className="bench-review_title">{r.title}</h3>}
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>{r.body}</p>
          <p className="bench-small bench-muted" style={{ margin: 0 }}>A brand {brokerName} worked with on Bench</p>
          {r.response && (
            <div className="bench-review_reply">
              <div className="bench-small" style={{ fontWeight: 600 }}>Reply from {brokerName}{r.response_at ? ` · ${day(r.response_at)}` : ""}</div>
              <p style={{ margin: 0, whiteSpace: "pre-line" }}>{r.response}</p>
            </div>
          )}
          {ownListing && <BrokerReviewTools reviewId={r.id} slug={slug} response={r.response} flagged={r.flagged} />}
        </li>
      ))}
    </ul>
  );
}
