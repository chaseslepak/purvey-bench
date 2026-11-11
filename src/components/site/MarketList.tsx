import Link from "next/link";
import type { MarketItem } from "@/lib/market";

/**
 * A list of retailers and distributors with a count, for the sign-up pages.
 * Renders nothing when there is nothing to show yet.
 */
export function MarketList({ items, audience, heading, lede, compact = false }: {
  items: MarketItem[]; audience: "brokers" | "brands"; heading: string; lede: string; compact?: boolean;
}) {
  if (!items.length) return null;
  const retailers = items.filter((i) => i.kind === "retailer");
  const distributors = items.filter((i) => i.kind === "distributor");
  const unit = (n: number) => (audience === "brokers" ? `${n} brand${n === 1 ? "" : "s"}` : `${n} broker${n === 1 ? "" : "s"}`);
  const group = (label: string, list: MarketItem[]) =>
    list.length > 0 && (
      <div className="bench-stack" style={{ gap: 10 }}>
        <h3 className="bench-eyebrow" style={{ margin: 0 }}>{label}</h3>
        <ul className="bench-market" aria-label={label}>
          {list.map((i) => (
            <li key={`${i.kind}-${i.id}`}>
              {audience === "brands" ? (
                <Link href={`/find?${i.kind}=${i.id}`} className="bench-market_item">
                  <span>{i.name}</span><span className="bench-market_count">{unit(i.count)}</span>
                </Link>
              ) : (
                <span className="bench-market_item"><span>{i.name}</span><span className="bench-market_count">{unit(i.count)}</span></span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="bench-stack" style={{ gap: compact ? 14 : 20 }}>
      <h2 className="bench-h-section" style={compact ? { fontSize: "1.5rem", margin: 0 } : { margin: 0 }}>{heading}</h2>
      <p className={compact ? "bench-small bench-muted" : "bench-lede"} style={{ margin: 0 }}>{lede}</p>
      {group("Retailers", retailers)}
      {group("Distributors", distributors)}
    </div>
  );
}
