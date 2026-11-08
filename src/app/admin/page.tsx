import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { LISTING_PRICE_LOOKUP_KEY, stripe, stripeConfigured } from "@/lib/billing/stripe";

export const metadata: Metadata = { title: "Overview" };

type Stats = Record<string, number | null>;

/** MRR straight from Stripe: active listing subscriptions × their price. */
async function stripeMrr(): Promise<{ cents: number; count: number } | null> {
  if (!stripeConfigured()) return null;
  try {
    let cents = 0, count = 0;
    for await (const sub of stripe().subscriptions.list({ status: "active", limit: 100, expand: ["data.items.data.price"] })) {
      for (const item of sub.items.data) {
        if (item.price.lookup_key !== LISTING_PRICE_LOOKUP_KEY) continue;
        const amount = item.price.unit_amount ?? 0;
        const monthly = item.price.recurring?.interval === "year" ? amount / 12 : amount;
        cents += monthly * (item.quantity ?? 1);
        count++;
      }
    }
    return { cents, count };
  } catch {
    return null;
  }
}

export default async function AdminOverview() {
  const { db } = await requireAdmin();
  const [{ data }, mrr] = await Promise.all([db.rpc("admin_stats"), stripeMrr()]);
  const s = (data ?? {}) as Stats;
  const n = (k: string) => (s[k] ?? 0).toLocaleString("en-US");
  const tiles: [string, string, string][] = [
    ["MRR", mrr ? `$${(mrr.cents / 100).toLocaleString("en-US")}` : `$${((s.paying_listings ?? 0) * 100).toLocaleString("en-US")}`, mrr ? `${mrr.count} active in Stripe` : "Estimated: Stripe not connected"],
    ["Live listings", n("live_listings"), `${n("comped_listings")} comped · ${n("new_listings_week")} new this week`],
    ["Brands", n("brands"), `${n("brands_week")} joined this week`],
    ["Conversations", n("conversations"), `${n("conversations_month")} this month`],
    ["Broker reply rate", s.reply_rate == null ? "—" : `${s.reply_rate}%`, "Conversations with a human reply"],
    ["Past due", n("past_due"), `${n("churned_month")} canceled this month`],
  ];
  const queues: [string, string, string][] = [
    ["Verification requests", n("verifications_waiting"), "/admin/verification"],
    ["Open reports", n("open_reports"), "/admin/reports"],
    ["New placement requests", n("placements_new"), "/admin/requests"],
    ["New commission audit requests", n("audits_new"), "/admin/requests"],
    ["Draft listings", n("drafts"), "/admin/listings?status=draft"],
  ];
  return (
    <>
      <section className="bench-grid-3">
        {tiles.map(([label, value, help]) => (
          <div key={label} className="bench-card bench-stack" style={{ gap: 8 }}>
            <div className="bench-eyebrow">{label}</div>
            <div className="bench-h-section" style={{ margin: 0 }}>{value}</div>
            <p className="bench-small bench-muted" style={{ margin: 0 }}>{help}</p>
          </div>
        ))}
      </section>
      <section className="bench-section bench-stack">
        <h2 className="bench-h-section" style={{ fontSize: "1.5rem" }}>Waiting on Purvey</h2>
        <div className="bench-table-wrap">
          <table className="bench-table">
            <thead><tr><th scope="col">Queue</th><th scope="col">Waiting</th></tr></thead>
            <tbody>
              {queues.map(([label, value, href]) => (
                <tr key={label}><td><Link className="bench-link" href={href}>{label}</Link></td><td>{value}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="bench-small bench-muted">
          Every admin action is written to the <Link className="bench-link" href="/admin/audit">audit log</Link>. Admins can&rsquo;t read a conversation unless it is reported, or commission records unless an audit is requested.
        </p>
      </section>
    </>
  );
}
