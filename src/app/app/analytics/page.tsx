import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analytics", robots: { index: false } };

const METRICS = [
  { key: "search_impression", label: "Shown in search" },
  { key: "profile_view", label: "Profile views" },
  { key: "contact_reveal", label: "Contact reveals" },
  { key: "save", label: "Saves" },
  { key: "message", label: "New conversations" },
] as const;

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 160, h = 40, max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - 4 - (v / max) * (h - 8)}`);
  const area = `0,${h} ${pts.join(" ")} ${w},${h}`;
  const last = pts[pts.length - 1]?.split(",").map(Number) ?? [w, h];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`${label} trend`} preserveAspectRatio="none">
      <line x1="0" x2={w} y1={h - 4} y2={h - 4} stroke="var(--pv-line)" strokeWidth="1" />
      <polygon points={area} fill="var(--pv-cta)" opacity="0.5" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--pv-blue)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="var(--pv-blue)" />
    </svg>
  );
}

type Row = { day: string; type: string; total: number };
/** One value per UTC day, oldest first, ending today. */
function dailySeries(rows: Row[], key: string, days: number): number[] {
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getTime() - (days - 1 - i) * 864e5).toISOString().slice(0, 10);
    return Number(rows.find((r) => r.day === d && r.type === key)?.total ?? 0);
  });
}

export default async function Analytics({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  if (session.org.type !== "broker") redirect("/app");
  const days = (await searchParams).days === "90" ? 90 : 30;
  const db = await createClient();
  const [{ data: rows }, { data: sugg }, { data: checklist }] = await Promise.all([
    db.rpc("listing_analytics", { p_days: days }),
    db.rpc("broker_suggestions"),
    db.rpc("my_listing_checklist"),
  ]);
  const series = (key: string) => dailySeries((rows ?? []) as Row[], key, days);
  const suggestions = (sugg ?? []) as { kind: string; label: string; searches: number; current: string | null }[];
  const missing = ((checklist ?? []) as { label: string; done: boolean }[]).filter((c) => !c.done);

  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="bench-row" style={{ justifyContent: "space-between" }}>
          <div className="text_title">{session.org.name}</div>
          <nav className="bench-chips" aria-label="Period">
            <Link className="bench-chip" aria-current={days === 30 ? "page" : undefined} href="/app/analytics">30 days</Link>
            <Link className="bench-chip" aria-current={days === 90 ? "page" : undefined} href="/app/analytics?days=90">90 days</Link>
          </nav>
        </div>
        <h1 className="bench-h-section">Analytics</h1>
        <p className="bench-lede" style={{ margin: 0 }}>How brands found and engaged with your listing over the last {days} days. Brand names are never shown.</p>
      </section>
      <section className="bench-kpis" aria-label="Metrics">
        {METRICS.map((m) => {
          const s = series(m.key);
          const total = s.reduce((a, b) => a + b, 0);
          return (
            <div key={m.key} className="bench-card is-white bench-stack" style={{ gap: 8 }}>
              <div className="bench-eyebrow" style={{ fontSize: 11 }}>{m.label}</div>
              <b className="bench-h-section" style={{ fontSize: "2rem" }}>{total.toLocaleString("en-US")}</b>
              <Sparkline values={s} label={m.label} />
            </div>
          );
        })}
      </section>
      <section className="bench-section bench-stack">
        <h2 className="bench-h-section" style={{ fontSize: "1.75rem" }}>Ways to show up in more searches</h2>
        {suggestions.length === 0 && missing.length === 0 ? (
          <p className="bench-muted" style={{ margin: 0 }}>Nothing to suggest right now.</p>
        ) : (
          <ul className="bench-plainlist" style={{ gap: 10 }}>
            {suggestions.map((s) => (
              <li key={s.kind + s.label}>
                <Link className="bench-link" href="/app/listing">
                  {s.kind === "retailer"
                    ? s.current ? `Add weekly calls for ${s.label}` : `Add ${s.label} with your call frequency`
                    : `Add ${s.label} to your coverage`}
                </Link>
                <span className="bench-muted bench-small"> · brands searched for it {s.searches} time{Number(s.searches) === 1 ? "" : "s"} this month</span>
              </li>
            ))}
            {missing.slice(0, 4).map((m) => <li key={m.label}><Link className="bench-link" href="/app/listing">{m.label}</Link></li>)}
          </ul>
        )}
      </section>
    </>
  );
}
