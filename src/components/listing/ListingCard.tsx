import { RatingSummary } from "@/components/reviews/Stars";
import { FREQ_LABEL, type Freq } from "@/lib/coverage";

export type ListingCardData = {
  name: string;
  logoUrl: string | null;
  hq: string | null;
  coverage: string;
  channels: string[];
  retailers: { name: string; freq: Freq }[]; // already the top five
  verified: boolean;
  notTakingNewLines?: boolean;
  fit?: { score: number; reasons: string[] } | null;
  conflict?: string | null;
  rating?: { average: number; count: number } | null;
};

/** The public profile card. Used by the builder preview and by search results. */
export function ListingCard({ data, headingLevel = 3 }: { data: ListingCardData; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as "h2" | "h3";
  return (
    <article className="bench-lcard">
      <div className="bench-lcard_top">
        <div className="bench-lcard_logo" aria-hidden={!data.logoUrl}>
          {data.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo from Supabase Storage
            <img src={data.logoUrl} alt={`${data.name} logo`} />
          ) : (
            <span>{(data.name || "?").slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <H className="bench-lcard_name">{data.name || "Your brokerage"}</H>
          <p className="bench-small bench-muted">{[data.hq, data.coverage].filter(Boolean).join(" · ")}</p>
          {data.rating && <div className="bench-small"><RatingSummary average={data.rating.average} count={data.rating.count} compact /></div>}
        </div>
        {data.fit && <div className="bench-lcard_fit" title="Fit to your brief"><b aria-hidden="true">{data.fit.score}</b><span aria-hidden="true">fit</span><span className="bench-sr-only">Fit score {data.fit.score} of 100</span></div>}
      </div>
      <div className="bench-row" style={{ gap: 6 }}>
        {data.verified && <span className="bench-tag is-blue">Verified</span>}
        {data.notTakingNewLines && <span className="bench-tag">Not taking new lines</span>}
        {data.channels.slice(0, 4).map((c) => <span key={c} className="bench-tag is-mist">{c}</span>)}
      </div>
      {data.conflict && <p className="bench-notice is-warn bench-small" style={{ margin: 0 }}>{data.conflict}</p>}
      {data.fit && data.fit.reasons.length > 0 && <p className="bench-small" style={{ margin: 0 }}>{data.fit.reasons.join(", ")}</p>}
      <div>
        <div className="bench-eyebrow" style={{ fontSize: 11, marginBottom: 6 }}>Top retailers</div>
        {data.retailers.length ? (
          <ul className="bench-lcard_retailers">
            {data.retailers.map((r) => (
              <li key={r.name}><span>{r.name}</span><span className="bench-muted">{FREQ_LABEL[r.freq]}</span></li>
            ))}
          </ul>
        ) : (
          <p className="bench-small bench-muted" style={{ margin: 0 }}>No retailers yet</p>
        )}
      </div>
    </article>
  );
}
