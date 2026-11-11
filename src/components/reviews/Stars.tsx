/** Five stars filled to `value` (0–5, halves shown). Read as one label by screen readers. */
export function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  const v = Math.max(0, Math.min(5, value));
  return (
    <span className="bench-stars" role="img" aria-label={label ?? `${v.toFixed(1)} out of 5 stars`} style={{ fontSize: size }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span key={i} className="bench-star" aria-hidden="true">
            <span className="bench-star_fill" style={{ width: `${Math.round(fill * 2) * 50}%` }}>★</span>★
          </span>
        );
      })}
    </span>
  );
}

/** "★★★★½ 4.6 · 12 reviews", or nothing when there are no reviews. */
export function RatingSummary({ average, count, compact = false }: { average: number | null; count: number; compact?: boolean }) {
  if (!count || average == null) return null;
  return (
    <span className="bench-rating">
      <Stars value={average} size={compact ? 14 : 18} />
      <span className="bench-rating_num">{average.toFixed(1)}</span>
      <span className="bench-muted">· {count} review{count === 1 ? "" : "s"}</span>
    </span>
  );
}
